// ==== Music from a YouTube playlist (IFrame Player API) ===================================================
// The player stays visible in a small dock (YouTube's rules don't allow a hidden player): in the menu and,
// during races, tucked under the lap panel. Volume follows the music slider and the race ducking setting.
const YT_DEFAULT = 'https://www.youtube.com/playlist?list=PLy1rKGexTy2tV8RCTBjw3xGb6d56jGlcD'; // "Hardstyle 2026 Playlist" by BrutishHeavyMusic
const YTMusic = {
  player: null, ready: false, vol: 0.55, wanted: false, failed: false,
  parse(url) {
    const s = (url || '').trim(), list = s.match(/[?&]list=([\w-]+)/), vid = s.match(/(?:v=|youtu\.be\/|shorts\/)([\w-]{11})/);
    if (list) return { list: list[1] }; if (vid) return { video: vid[1] }; if (/^[\w-]{11}$/.test(s)) return { video: s }; if (/^(PL|UU|OL|RD)[\w-]+$/.test(s)) return { list: s };
    return null;
  },
  loadApi() {
    if (this.api) return this.api;
    return (this.api = new Promise((ok, no) => {
      if (window.YT && window.YT.Player) return ok();
      const prev = window.onYouTubeIframeAPIReady; window.onYouTubeIframeAPIReady = () => { prev && prev(); ok(); };
      const s = document.createElement('script'); s.src = 'https://www.youtube.com/iframe_api'; s.onerror = () => no(new Error('YouTube could not be reached (offline?)')); document.head.appendChild(s);
      setTimeout(() => no(new Error('YouTube did not load')), 15000);
    }));
  },
  // create (or switch) the player; called from a tap so phones allow sound
  play(url) {
    this.wanted = true; $('#yt-dock').hidden = false;
    const src = this.parse(url || settings.ytUrl || YT_DEFAULT) || this.parse(YT_DEFAULT);
    if (this.player && this.ready && (!url || JSON.stringify(src) === JSON.stringify(this.src))) { this.player.playVideo(); return Promise.resolve(); }
    this.src = src;
    return this.loadApi().then(() => {
      const vars = { autoplay: 1, playsinline: 1, rel: 0, modestbranding: 1, controls: 1, loop: 1 };
      if (src.list) Object.assign(vars, { listType: 'playlist', list: src.list }); else vars.playlist = src.video;
      if (this.player) { this.ready = false; this.player.destroy(); }
      $('#yt-dock').innerHTML = '<div id="yt-frame"></div>';
      this.player = new YT.Player('yt-frame', {
        width: 200, height: 113, ...(src.video ? { videoId: src.video } : {}), playerVars: vars,
        events: {
          onReady: (e) => { this.ready = true; this.apply(); if (src.list) e.target.setShuffle(true); if (this.wanted) e.target.playVideo(); },
          onError: () => { try { this.player.nextVideo(); } catch (er) { /* ignore */ } }, // skip videos that can't be embedded
          onStateChange: (e) => { if (e.data === 1) this.failed = false; this.onChange && this.onChange(); },
        },
      });
    }).catch((e) => { this.failed = true; this.msg = e.message; this.onChange && this.onChange(); throw e; });
  },
  stop() { this.wanted = false; if (this.player && this.ready) this.player.pauseVideo(); $('#yt-dock').hidden = true; },
  toggle() { if (!this.player || !this.ready) return this.play(); const st = this.player.getPlayerState(); if (st === 1) this.player.pauseVideo(); else this.player.playVideo(); },
  next() { if (this.ready) this.player.nextVideo(); }, prev() { if (this.ready) this.player.previousVideo(); },
  setVolume(v) { this.vol = v; this.apply(); },
  apply() { if (this.ready) this.player.setVolume(Math.round(Math.max(0, Math.min(1, this.vol)) * 100)); },
  title() { try { const d = this.player.getVideoData(); return d && d.title ? d.title : ''; } catch (e) { return ''; } },
  // race layout: dock moves under the lap panel during a session
  dock(inRace) { document.body.classList.toggle('yt-race', !!inRace); },
};
