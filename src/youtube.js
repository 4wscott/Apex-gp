// ==== Music from a YouTube playlist (IFrame Player API) ===================================================
// The player is kept off-screen-invisible (opacity 0) at the owner's request; it is only revealed with a
// "tap to start music" prompt when a phone refuses to start sound without a tap on it.
// Volume follows the music slider and the race ducking setting.
// curated public playlists; "random" picks a different one each time the game is opened
const YT_PLAYLISTS = [
  ['Hardstyle 2026', 'PLy1rKGexTy2tV8RCTBjw3xGb6d56jGlcD'], ['Hardstyle bangers 2025', 'PL5nusU5MSa3Z_nazUQ_Uxuae8-98AHKhK'],
  ['Hardstyle remixes of popular songs', 'PLVHnsyYLyRJZ0ZqnVDJQUeUqGY070rjKR'], ['Gym hardstyle', 'PLfja-fNLrp00Vk3ms6JTyAnitKgaWf8oO'],
  ['Rawstyle edits', 'PL81eR0YlVCM_gLJK9Iom4tdvRpVNhWk96'], ['EDM 2026', 'PL4-MKBsKCTsmthxX8j678ZVk-wjtsuyNg'],
  ['Bass-boosted car music', 'PL1MXdZDgdwMo88k_ebmVJRLKQ96DkMBNT'], ['Drum & bass remixes', 'PL4QNnZJr8sRNDdZTYrv5x1EY7EMOiu4wZ'],
];
const YT_DEFAULT = 'https://www.youtube.com/playlist?list=' + YT_PLAYLISTS[0][1];
const YTMusic = {
  player: null, ready: false, vol: 0.55, wanted: false, failed: false,
  parse(url) {
    const s = (url || '').trim(), list = s.match(/(?:^|[?&])list=([\w-]+)/), vid = s.match(/(?:v=|youtu\.be\/|shorts\/)([\w-]{11})/);
    if (list) return { list: list[1] }; if (vid) return { video: vid[1] }; if (/^[\w-]{11}$/.test(s)) return { video: s }; if (/^(PL|UU|OL|RD)[\w-]+$/.test(s)) return { list: s };
    return null;
  },
  loadApi() {
    if (this.api) return this.api;
    return (this.api = new Promise((ok, no) => {
      if (window.YT && window.YT.Player) return ok();
      const prev = window.onYouTubeIframeAPIReady; window.onYouTubeIframeAPIReady = () => { prev && prev(); ok(); };
      const s = document.createElement('script'); s.src = 'https://www.youtube.com/iframe_api'; s.onerror = () => no(new Error('YouTube could not be reached (offline?)')); document.head.appendChild(s);
      setTimeout(() => no(new Error('YouTube did not load')), 25000);
    }).catch((e) => { this.api = null; throw e; })); // a failed load is retried on the next request
  },
  // which playlist: the user's own link, a chosen preset, or a random preset (kept for the whole session)
  pick() {
    const c = settings.ytList ?? 'random';
    if (c === 'custom' && this.parse(settings.ytUrl)) return settings.ytUrl;
    if (c !== 'random' && c !== 'custom' && YT_PLAYLISTS[+c]) return 'list=' + YT_PLAYLISTS[+c][1];
    if (this.session == null) this.session = (Math.random() * YT_PLAYLISTS.length) | 0;
    return 'list=' + YT_PLAYLISTS[this.session][1];
  },
  playlistName() { const id = this.src && this.src.list; const f = YT_PLAYLISTS.find((p) => p[1] === id); return f ? f[0] : id ? 'Your playlist' : ''; },
  // jump to another random preset
  shuffleList() { let k; do { k = (Math.random() * YT_PLAYLISTS.length) | 0; } while (YT_PLAYLISTS.length > 1 && 'list=' + YT_PLAYLISTS[k][1] === 'list=' + (this.src && this.src.list)); this.session = k; return this.play('list=' + YT_PLAYLISTS[k][1]); },
  // create (or switch) the player; called from a tap so phones allow sound
  play(url) {
    this.wanted = true; $('#yt-dock').hidden = false;
    const src = this.parse(url || this.pick()) || this.parse(YT_DEFAULT);
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
          onReady: (e) => {
            this.ready = true; this.apply(); if (src.list) e.target.setShuffle(true); if (this.wanted) e.target.playVideo();
            // some phones only start YouTube sound from a tap on the player itself: reveal it with a prompt if needed
            setTimeout(() => this.checkTap(), 5000);
          },
          onError: () => { try { this.player.nextVideo(); } catch (er) { /* ignore */ } }, // skip videos that can't be embedded
          onStateChange: (e) => { if (e.data === 1) { this.failed = false; document.body.classList.remove('yt-tap'); } this.onChange && this.onChange(); },
        },
      });
    }).catch((e) => { this.failed = true; this.msg = e.message; this.onChange && this.onChange(); throw e; });
  },
  // menu only: if a phone refused to start the sound, briefly reveal the player so one tap starts it
  checkTap() { const menu = !$('#menu').hidden; document.body.classList.toggle('yt-tap', menu && this.wanted && this.ready && this.player.getPlayerState() !== 1); },
  stop() { this.wanted = false; if (this.player && this.ready) this.player.pauseVideo(); $('#yt-dock').hidden = true; document.body.classList.remove('yt-tap'); },
  toggle() { if (!this.player || !this.ready) return this.play(); const st = this.player.getPlayerState(); if (st === 1) this.player.pauseVideo(); else this.player.playVideo(); },
  next() { if (this.ready) this.player.nextVideo(); }, prev() { if (this.ready) this.player.previousVideo(); },
  setVolume(v) { this.vol = v; this.apply(); },
  apply() { if (this.ready) this.player.setVolume(Math.round(Math.max(0, Math.min(1, this.vol)) * 100)); },
  title() { try { const d = this.player.getVideoData(); return d && d.title ? d.title : ''; } catch (e) { return ''; } },
  dock() {},
};
