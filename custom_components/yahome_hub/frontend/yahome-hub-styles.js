/* YaHome Hub panel styles. Extracted from yahome-hub-panel.js. */
export const PANEL_STYLES = `
      :host {
        display: block;
        min-height: 100vh;
        background: var(--primary-background-color, #f5f6f8);
        color: var(--primary-text-color, #1f2430);
        font-family: var(--ha-font-family-body, "Segoe UI", Roboto, sans-serif);
      }
      * { box-sizing: border-box; }
      .shell { max-width: 1480px; margin: 0 auto; padding: 28px 24px 64px; }
      .top { display: flex; justify-content: space-between; align-items: center; gap: 18px; margin-bottom: 18px; }
      .brand { display: flex; align-items: center; gap: 16px; }
      .logo {
        width: 56px; height: 56px; border-radius: 18px; overflow: hidden; display: grid; place-items: center;
        color: white; font-size: 28px;
        background: linear-gradient(135deg, #5b6cff 0%, #8f43ff 55%, #ff4f9a 100%);
        box-shadow: 0 12px 30px rgba(91, 108, 255, .28);
      }
      .logo img { width: 100%; height: 100%; object-fit: cover; display: block; }
      h1 { margin: 0; font-size: 26px; letter-spacing: -.4px; }
      .brand p { margin: 3px 0 0; color: var(--secondary-text-color, #667085); font-size: 13px; }
      .build-badge {
        display: inline-block; margin-left: 6px; padding: 2px 7px; border-radius: 999px;
        background: rgba(91, 108, 255, .12); border: 1px solid rgba(91, 108, 255, .28);
        color: #5b6cff; font-size: 10px; font-weight: 700; letter-spacing: .03em;
        vertical-align: 1px; white-space: nowrap;
      }
      .top-actions { display: flex; gap: 10px; }
      .icon-btn {
        width: 42px; height: 42px; border-radius: 14px; border: 1px solid var(--divider-color, #e4e7ec);
        background: var(--card-background-color, #fff); color: var(--primary-text-color, #1f2430);
        cursor: pointer; display: grid; place-items: center; font-size: 20px;
        transition: transform .15s ease, box-shadow .15s ease;
      }
      .icon-btn:hover { transform: translateY(-1px); box-shadow: 0 8px 18px rgba(16, 24, 40, .08); }
      .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-bottom: 20px; }
      .stat {
        background: var(--card-background-color, #fff); border: 1px solid var(--divider-color, #e4e7ec);
        border-radius: 18px; padding: 14px 18px; display: flex; align-items: baseline; gap: 9px;
      }
      .stat span { font-size: 28px; font-weight: 700; letter-spacing: -.5px; }
      .stat small { color: var(--secondary-text-color, #667085); font-size: 12px; }
      .toolbar { display: flex; flex-direction: column; gap: 12px; margin-bottom: 18px; }
      .search {
        display: flex; align-items: center; gap: 10px; background: var(--card-background-color, #fff);
        border: 1px solid var(--divider-color, #e4e7ec); border-radius: 16px; padding: 0 14px; height: 46px;
      }
      .search ha-icon { color: var(--secondary-text-color, #667085); }
      .search input { border: 0; outline: 0; background: transparent; color: inherit; font: inherit; width: 100%; }
      .chips { display: flex; gap: 8px; flex-wrap: wrap; }
      .chip {
        border: 1px solid var(--divider-color, #e4e7ec); background: var(--card-background-color, #fff);
        color: var(--secondary-text-color, #667085); border-radius: 999px; padding: 7px 13px;
        font: inherit; font-size: 12px; cursor: pointer;
      }
      .chip b { opacity: .65; font-weight: 600; }
      .chip.active { background: var(--primary-color, #5b6cff); color: #fff; border-color: transparent; }
      .grid {
        display: grid; grid-template-columns: repeat(auto-fill, minmax(255px, 1fr));
        gap: 14px; align-items: stretch;
      }
      .card {
        background: var(--card-background-color, #fff); border: 1px solid var(--divider-color, #e4e7ec);
        border-radius: 20px; padding: 16px; cursor: pointer; position: relative;
        min-height: 268px; height: 100%; display: flex; flex-direction: column;
        transition: transform .15s ease, box-shadow .15s ease, border-color .15s ease;
      }
      .card:hover { transform: translateY(-2px); box-shadow: 0 14px 30px rgba(16, 24, 40, .09); border-color: transparent; }
      .card-head { display: flex; justify-content: space-between; align-items: flex-start; }
      .device-icon {
        width: 46px; height: 46px; border-radius: 15px; display: grid; place-items: center;
        font-size: 24px; color: var(--accent, #5b6cff);
        background: color-mix(in srgb, var(--accent, #5b6cff) 13%, transparent);
      }
      .device-icon.big { width: 68px; height: 68px; border-radius: 22px; font-size: 34px; }
      .status { width: 10px; height: 10px; border-radius: 50%; background: #c0c6d0; }
      .status.online { background: #22c55e; box-shadow: 0 0 0 4px rgba(34, 197, 94, .14); }
      .status.offline { background: #ef4444; box-shadow: 0 0 0 4px rgba(239, 68, 68, .12); }
      .card h3 {
        margin: 14px 0 4px; font-size: 15px; line-height: 1.3;
        min-height: 2.6em; display: -webkit-box; -webkit-line-clamp: 2;
        -webkit-box-orient: vertical; overflow: hidden;
      }
      .muted { color: var(--secondary-text-color, #667085); font-size: 12px; margin: 0; }
      .card-foot {
        display: flex; justify-content: space-between; align-items: center;
        margin-top: auto; padding-top: 12px; gap: 10px;
      }
      .state {
        font-size: 12px; font-weight: 600; color: var(--primary-text-color, #1f2430);
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .power {
        width: 34px; height: 34px; border-radius: 12px; border: 1px solid var(--divider-color, #e4e7ec);
        background: transparent; color: var(--secondary-text-color, #667085); cursor: pointer; display: grid; place-items: center;
      }
      .power.on { background: var(--primary-color, #5b6cff); border-color: transparent; color: #fff; }
      .detail { display: flex; flex-direction: column; gap: 16px; }
      .back {
        align-self: flex-start; display: inline-flex; align-items: center; gap: 7px;
        border: 1px solid var(--divider-color, #e4e7ec); background: var(--card-background-color, #fff);
        color: var(--primary-text-color, #1f2430); border-radius: 12px; padding: 8px 12px; cursor: pointer; font: inherit;
      }
      .detail-head { display: flex; align-items: center; gap: 18px; background: var(--card-background-color, #fff); border: 1px solid var(--divider-color, #e4e7ec); border-radius: 22px; padding: 20px; }
      .detail-head h2 { margin: 0 0 4px; font-size: 24px; }
      .status-text { display: inline-block; margin-top: 8px; font-size: 12px; font-weight: 600; }
      .status-text.online { color: #16a34a; }
      .status-text.offline { color: #dc2626; }
      .device-info-grid { display: grid; gap: 8px; }
      .device-info-row {
        display: flex; justify-content: space-between; gap: 14px;
        padding: 8px 0; border-bottom: 1px solid var(--divider-color, #eef0f4);
        font-size: 13px;
      }
      .device-info-row:last-child { border-bottom: 0; }
      .device-info-row span { color: var(--secondary-text-color, #667085); }
      .device-info-row b { text-align: right; word-break: break-word; }
      .section { background: var(--card-background-color, #fff); border: 1px solid var(--divider-color, #e4e7ec); border-radius: 22px; padding: 18px; }
      .section h3 { margin: 0 0 14px; font-size: 15px; }
      .controls { display: flex; flex-direction: column; gap: 12px; }
      .control-row { display: flex; justify-content: space-between; align-items: center; gap: 14px; padding: 10px 0; border-bottom: 1px solid var(--divider-color, #eef0f4); }
      .control-row:last-child { border-bottom: 0; }
      .control-row small { display: block; color: var(--secondary-text-color, #667085); margin-top: 3px; }
      .media-buttons { display: flex; gap: 6px; }
      .media-buttons .icon-btn { width: 34px; height: 34px; border-radius: 10px; font-size: 16px; }
      .control-block { padding: 10px 0; border-bottom: 1px solid var(--divider-color, #eef0f4); }
      .control-block:last-child { border-bottom: 0; }
      .control-label { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 8px; font-size: 13px; }
      .control-label.sub { margin-top: 12px; color: var(--secondary-text-color, #667085); font-size: 12px; }
      input[type="range"] { width: 100%; accent-color: var(--primary-color, #5b6cff); }
      select {
        width: 100%; height: 40px; border-radius: 12px; border: 1px solid var(--divider-color, #e4e7ec);
        background: var(--secondary-background-color, #f7f8fa); color: var(--primary-text-color, #1f2430);
        padding: 0 10px; font: inherit;
      }
      .switch {
        width: 50px; height: 28px; border-radius: 999px; border: 0; padding: 3px; cursor: pointer;
        background: #cfd5df; transition: background .15s ease; flex: none;
      }
      .switch span { display: block; width: 22px; height: 22px; border-radius: 50%; background: #fff; transition: transform .15s ease; }
      .switch.on { background: var(--primary-color, #5b6cff); }
      .switch.on span { transform: translateX(22px); }
      .props { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 10px; }
      .prop { display: flex; justify-content: space-between; gap: 10px; background: var(--secondary-background-color, #f7f8fa); border-radius: 12px; padding: 10px 12px; font-size: 13px; }
      .prop span { color: var(--secondary-text-color, #667085); }
      .scenarios { display: flex; flex-wrap: wrap; gap: 10px; }
      .scenario {
        display: inline-flex; align-items: center; gap: 8px; border: 1px solid var(--divider-color, #e4e7ec);
        background: var(--card-background-color, #fff); color: var(--primary-text-color, #1f2430);
        border-radius: 14px; padding: 10px 14px; cursor: pointer; font: inherit;
      }
      .scenario:hover { border-color: var(--primary-color, #5b6cff); color: var(--primary-color, #5b6cff); }
      .speakers { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; }
      .speaker { border: 1px solid var(--divider-color, #e4e7ec); border-radius: 16px; padding: 14px; }
      .speaker-head { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
      .speaker-head strong { display: block; font-size: 14px; }
      .speaker-head small { display: block; color: var(--secondary-text-color, #667085); font-size: 11px; margin-top: 2px; }
      .speaker-head .power { margin-left: auto; }
      .tabs {
        display: flex; gap: 6px; margin: 4px 0 18px; padding: 5px;
        background: var(--card-background-color, #fff); border: 1px solid var(--divider-color, #e4e7ec);
        border-radius: 16px; overflow-x: auto;
      }
      .tab {
        display: inline-flex; align-items: center; gap: 8px; border: 0; background: transparent;
        color: var(--secondary-text-color, #667085); border-radius: 12px; padding: 10px 14px;
        font: inherit; font-size: 13px; cursor: pointer; white-space: nowrap;
      }
      .tab ha-icon { --mdc-icon-size: 18px; }
      .tab b { font-size: 11px; opacity: .65; }
      .tab.active {
        color: #fff; background: linear-gradient(135deg, #5b6cff 0%, #8f43ff 60%, #ff4f9a 100%);
        box-shadow: 0 8px 18px rgba(91, 108, 255, .25);
      }
      .speakers-section { display: flex; flex-direction: column; gap: 16px; }
      .overview-media { margin-bottom: 26px; }
      .overview-media-head { margin-bottom: 12px; }
      .overview-media-head h3 { margin: 0 0 4px; font-size: 20px; }
      .overview-media-head p { margin: 0; color: var(--secondary-text-color, #667085); font-size: 12px; }
      .speaker-toolbar { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; }
      .speaker-toolbar h3 { margin: 0 0 4px; font-size: 17px; }
      .viz-switch {
        display: flex; gap: 3px; padding: 4px; border: 1px solid var(--divider-color, #e4e7ec);
        background: var(--card-background-color, #fff); border-radius: 14px; flex: none;
        max-width: 100%; overflow-x: auto; scrollbar-width: thin;
      }
      .viz-switch button {
        display: inline-flex; align-items: center; gap: 5px; border: 0; background: transparent;
        color: var(--secondary-text-color, #667085); border-radius: 10px; padding: 7px 9px;
        font: inherit; font-size: 11px; cursor: pointer; flex: none; white-space: nowrap;
      }
      .viz-switch button ha-icon { --mdc-icon-size: 15px; }
      .viz-switch button.active { background: var(--primary-color, #5b6cff); color: #fff; }
      .players { display: grid; grid-template-columns: repeat(auto-fit, minmax(520px, 1fr)); gap: 20px; }
      .player {
        position: relative; overflow: hidden; border-radius: 30px; padding: 24px;
        border: 1px solid var(--divider-color, #e4e7ec); background: var(--card-background-color, #fff);
        isolation: isolate;
      }
      .player-bg {
        position: absolute; inset: -25%; z-index: -2; background-image: var(--cover);
        background-size: cover; background-position: center; filter: blur(38px) saturate(1.4);
        opacity: .34; transform: scale(1.15);
      }
      .player-glow {
        position: absolute; inset: 0; z-index: -1; pointer-events: none;
        background: linear-gradient(135deg, rgba(91, 108, 255, .16), rgba(255, 79, 154, .12));
      }
      .player-content { position: relative; display: flex; flex-direction: column; gap: 12px; }
      .player-head { display: flex; align-items: center; gap: 14px; }
      .player-cover {
        position: relative; width: 120px; height: 120px; flex: none; border-radius: 26px; overflow: hidden;
        display: grid; place-items: center; color: #fff; font-size: 44px;
        background: linear-gradient(135deg, #5b6cff, #8f43ff 55%, #ff4f9a);
        box-shadow: 0 18px 38px rgba(16, 24, 40, .24);
      }
      .player-cover img { width: 100%; height: 100%; object-fit: cover; display: block; }
      .player.playing .player-cover img { animation: coverFloat 5s ease-in-out infinite; }
      @keyframes coverFloat {
        0%, 100% { transform: scale(1) rotate(0deg); }
        50% { transform: scale(1.05) rotate(.6deg); }
      }
      .player-meta { min-width: 0; flex: 1; }
      .player-kicker {
        display: block; font-size: 9px; letter-spacing: .14em; text-transform: uppercase;
        color: var(--secondary-text-color, #667085); font-weight: 700;
      }
      .player-meta h3 {
        margin: 5px 0; font-size: 24px; line-height: 1.2;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .player-meta p {
        margin: 0; font-size: 12px; color: var(--secondary-text-color, #667085);
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .player-meta .dot { opacity: .45; }
      .player-actions { display: flex; align-items: center; gap: 6px; margin-left: auto; }
      .player-actions .power { margin-left: 0; }
      .player-power { margin-left: 0; }
      .player-modal {
        position: fixed; inset: 0; z-index: 100; display: grid; place-items: center;
        padding: 18px;
      }
      .player-modal-backdrop {
        position: absolute; inset: 0; background: rgba(5, 6, 15, .72);
        backdrop-filter: blur(10px);
      }
      .player-modal-body {
        position: relative; width: min(1120px, 96vw); max-height: 94vh; overflow: auto;
        border-radius: 32px; scrollbar-width: thin;
      }
      .player.full {
        padding: 28px; border-radius: 32px; border-color: rgba(255,255,255,.18);
        box-shadow: 0 40px 100px rgba(0,0,0,.45);
      }
      .player.full .player-head { align-items: flex-start; }
      .player.full .player-cover.big {
        width: min(380px, 38vw); height: min(380px, 38vw);
        border-radius: 30px; font-size: 80px;
      }
      .player.full .player-cover.big img { border-radius: 30px; }
      .player.full .player-meta { padding-top: 10px; }
      .player.full .player-meta h3 { font-size: 30px; line-height: 1.2; white-space: normal; }
      .player.full .player-meta p { font-size: 15px; white-space: normal; }
      .player.full .player-kicker { font-size: 11px; }
      .player.full .viz { height: 86px; }
      .player.full .player-seek input { height: 28px; }
      .player.full .times { font-size: 12px; }
      .player.full .player-controls { gap: 14px; }
      .player.full .player-controls .icon-btn { width: 46px; height: 46px; border-radius: 15px; }
      .player.full .player-controls .icon-btn.play { width: 58px; height: 58px; border-radius: 18px; }
      .player.full .volume-control { min-width: 220px; }
      .lyrics-overlay {
        position: absolute; left: 0; right: 0; bottom: 0; padding: 22px 20px 18px;
        background: linear-gradient(to top, rgba(5,6,15,.95), rgba(5,6,15,.35) 72%, transparent);
        text-align: center; pointer-events: none;
      }
      .lyrics-prev {
        color: rgba(255,255,255,.5); font-size: 13px; line-height: 1.25;
        margin-bottom: 6px; text-shadow: 0 2px 12px rgba(0,0,0,.8);
        transition: opacity .35s ease;
      }
      .lyrics-current-row {
        display: flex; align-items: center; justify-content: center; gap: 10px;
      }
      .lyrics-countdown {
        flex: none; min-width: 36px; text-align: right;
        color: rgba(255,255,255,.62); font-size: 12px;
        font-variant-numeric: tabular-nums;
        text-shadow: 0 2px 12px rgba(0,0,0,.8);
      }
      .lyrics-current {
        color: #fff; font-size: 25px; line-height: 1.25; font-weight: 700;
        text-shadow: 0 2px 16px rgba(0,0,0,.85);
        max-width: calc(100% - 50px);
      }
      .lyrics-next {
        color: rgba(255,255,255,.68); font-size: 14px; line-height: 1.3;
        margin-top: 7px; text-shadow: 0 2px 12px rgba(0,0,0,.8);
      }
      .lyric-in { animation: lyricIn .35s ease both; }
      @keyframes lyricIn {
        from { opacity: 0; transform: translateY(5px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .viz {
        height: 82px; display: flex; align-items: flex-end; justify-content: center; gap: 3px;
        padding: 9px 12px; border-radius: 16px; overflow: hidden;
        background: color-mix(in srgb, var(--primary-color, #5b6cff) 7%, transparent);
      }
      .viz-bars span {
        flex: 1; height: var(--h); border-radius: 4px 4px 2px 2px;
        background: linear-gradient(to top, #5b6cff, #ff4f9a);
        transform-origin: bottom; animation: barDance 1.15s ease-in-out infinite alternate;
        animation-delay: calc(var(--i) * -0.07s); opacity: .85;
      }
      @keyframes barDance { from { transform: scaleY(.28); } to { transform: scaleY(1); } }
      .viz-wave span {
        width: 4px; height: var(--h); border-radius: 99px;
        background: linear-gradient(to top, #5b6cff, #22b8a7);
        transform-origin: bottom; animation: waveDance 1.6s ease-in-out infinite;
        animation-delay: calc(var(--i) * -0.09s); opacity: .8;
      }
      @keyframes waveDance {
        0%, 100% { transform: scaleY(.3); }
        50% { transform: scaleY(1); }
      }
      .viz-orbit { position: relative; display: grid; place-items: center; }
      .viz-orbit i {
        position: absolute; width: 38px; height: 38px; border-radius: 50%;
        border: 2px solid rgba(91, 108, 255, .25); border-top-color: #ff4f9a;
        animation: orbitSpin 3s linear infinite;
      }
      .viz-orbit i:nth-child(2) {
        width: 52px; height: 52px; animation-duration: 4.6s; border-top-color: #5b6cff;
        animation-direction: reverse;
      }
      .viz-orbit i:nth-child(3) {
        width: 66px; height: 66px; animation-duration: 6.2s; border-top-color: #22b8a7;
      }
      .viz-orbit b {
        width: 10px; height: 10px; border-radius: 50%; background: #ff4f9a;
        box-shadow: 0 0 18px #ff4f9a;
      }
      @keyframes orbitSpin { to { transform: rotate(360deg); } }
      .player:not(.playing) .viz span,
      .player:not(.playing) .viz i,
      .player:not(.playing) .viz b {
        animation-play-state: paused; opacity: .35;
      }
      .player-seek input[type="range"] { width: 100%; accent-color: var(--primary-color, #5b6cff); }
      .times {
        display: flex; justify-content: space-between; margin-top: 2px;
        font-size: 10px; color: var(--secondary-text-color, #667085);
      }
      .player-controls { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
      .transport { display: flex; align-items: center; gap: 6px; }
      .player-controls .icon-btn { width: 46px; height: 46px; border-radius: 14px; }
      .player-controls .icon-btn.play {
        width: 56px; height: 56px; border-radius: 18px; border-color: transparent;
        background: linear-gradient(135deg, #5b6cff, #ff4f9a); color: #fff;
        box-shadow: 0 10px 24px rgba(91, 108, 255, .34);
      }
      .volume-control {
        display: flex; align-items: center; gap: 6px; flex: 1; min-width: 130px;
        color: var(--secondary-text-color, #667085);
      }
      .volume-control input { flex: 1; accent-color: var(--primary-color, #5b6cff); }
      .volume-control span { width: 34px; text-align: right; font-size: 11px; }
      .volume-toggle {
        display: grid; place-items: center; width: 28px; height: 28px;
        padding: 0; border: 0; background: none; color: inherit; cursor: pointer;
      }
      .volume-toggle:hover { color: var(--primary-color, #5b6cff); }
      .lyrics-sync {
        display: flex; align-items: center; justify-content: center; gap: 8px;
        margin-top: 10px; color: var(--secondary-text-color, #667085);
        font-size: 12px; flex-wrap: wrap;
      }
      .lyrics-sync b {
        min-width: 48px; text-align: center;
        color: var(--primary-text-color, #101828); font-weight: 600;
      }
      .sync-btn {
        min-width: 46px; height: 28px; padding: 0 8px; border-radius: 9px;
        border: 1px solid var(--divider-color, #e4e7ec);
        background: transparent; color: inherit; cursor: pointer; font-size: 11px;
      }
      .sync-btn:hover {
        border-color: var(--primary-color, #5b6cff);
        color: var(--primary-color, #5b6cff);
      }
      .eq-select { height: 36px; max-width: 165px; font-size: 12px; }
      .compact-speakers { margin-top: 2px; }
      .player.compact { display: flex; align-items: center; gap: 14px; padding: 14px; }
      .player.compact .player-cover { width: 56px; height: 56px; border-radius: 15px; font-size: 24px; }
      .player.compact .player-meta h3 { font-size: 14px; }
      .health-card {
        display: flex; flex-direction: column; gap: 12px;
        padding: 16px 18px; margin-bottom: 14px;
        border-radius: 22px;
        background: linear-gradient(135deg, rgba(91,108,255,.09), rgba(255,79,154,.06));
        border: 1px solid rgba(91,108,255,.18);
      }
      .health-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
      .health-title { display: flex; align-items: center; gap: 8px; font-size: 13px; }
      .health-title ha-icon { --mdc-icon-size: 18px; color: #5b6cff; }
      .health-build {
        font-size: 10px; font-weight: 700; padding: 2px 7px;
        border-radius: 999px; background: rgba(91,108,255,.12);
        color: #5b6cff;
      }
      .health-grid {
        display: grid; gap: 10px;
        grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
      }
      .health-tile {
        display: flex; flex-direction: column; gap: 3px;
        padding: 10px 12px; border-radius: 14px;
        background: rgba(255,255,255,.55);
        border: 1px solid rgba(16,24,40,.06);
      }
      .health-tile span { font-size: 10px; text-transform: uppercase; letter-spacing: .08em; color: #667085; }
      .health-tile b { font-size: 14px; }
      .health-tile small { font-size: 10px; color: #667085; line-height: 1.35; }
      .health-tile.ok b { color: #16a34a; }
      .health-tile.warn b { color: #d97706; }
      .health-tile.bad b { color: #dc2626; }
      .hub-intro { margin-bottom: 14px; }
      .hub-title { display: flex; align-items: center; gap: 14px; }
      .hub-title h3 { margin: 0 0 4px; font-size: 17px; }
      .hub-chips { margin-top: 14px; }
      .hub-health {
        display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px;
        font-size: 11px; color: var(--secondary-text-color, #667085);
      }
      .hub-health span {
        padding: 4px 9px; border-radius: 999px;
        background: rgba(91, 108, 255, .08);
      }
      .chip ha-icon { --mdc-icon-size: 16px; vertical-align: -3px; margin-right: 4px; }
      .hub-note { display: flex; gap: 10px; align-items: flex-start; margin-top: 14px; }
      .hub-note ha-icon { color: var(--primary-color, #5b6cff); flex: none; }
      .hub-grid {
        display: grid; gap: 16px;
        grid-template-columns: repeat(auto-fill, minmax(268px, 1fr));
      }
      .hub-card {
        border: 1px solid var(--divider-color, #e4e7ec);
        border-radius: 20px; padding: 18px;
        background: var(--card-background-color, #fff);
        box-shadow: 0 6px 18px rgba(16, 24, 40, .05);
        cursor: pointer; transition: transform .15s ease, box-shadow .15s ease;
        display: flex; flex-direction: column; gap: 6px;
      }
      .hub-card:hover { transform: translateY(-2px); box-shadow: 0 12px 26px rgba(16, 24, 40, .10); }
      .hub-card-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; }
      .hub-card h3 { margin: 0; font-size: 17px; }
      .hub-card p { margin: 0; font-size: 13px; }
      .hub-vendor { font-size: 12px; font-weight: 700; color: var(--primary-color, #5b6cff); }
      .hub-firmware { font-size: 11px; color: var(--secondary-text-color, #667085); }
      .hub-stats {
        display: flex; flex-wrap: wrap; gap: 8px;
        margin: 8px 0 4px; font-size: 11px;
        color: var(--secondary-text-color, #667085);
      }
      .hub-stats span {
        padding: 4px 8px; border-radius: 999px;
        background: rgba(91, 108, 255, .08);
      }
      .hub-stats b { color: var(--primary-text-color, #1f2430); }
      .hub-card .ghost-btn { margin-top: auto; align-self: flex-start; }
      .prop span { display: flex; align-items: center; gap: 6px; }
      .prop ha-icon { --mdc-icon-size: 16px; color: var(--secondary-text-color, #667085); }
      .loading { display: grid; place-items: center; padding: 70px 0; color: var(--secondary-text-color, #667085); }
      .spinner { width: 34px; height: 34px; border-radius: 50%; border: 3px solid var(--divider-color, #e4e7ec); border-top-color: var(--primary-color, #5b6cff); animation: spin .8s linear infinite; margin-bottom: 12px; }
      @keyframes spin { to { transform: rotate(360deg); } }
      .error { background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; border-radius: 14px; padding: 12px 14px; margin-bottom: 16px; font-size: 13px; }
      .empty { text-align: center; color: var(--secondary-text-color, #667085); padding: 44px 0; }
      .toast {
        position: fixed; right: 24px; bottom: 24px; z-index: 10; background: #111827; color: #fff;
        border-radius: 12px; padding: 12px 16px; font-size: 13px; box-shadow: 0 18px 40px rgba(0,0,0,.24);
      }
      .subtabs {
        display: flex; gap: 8px; margin: 0 0 16px; flex-wrap: wrap;
      }
      .subtabs button {
        display: inline-flex; align-items: center; gap: 7px;
        padding: 9px 14px; border-radius: 12px; cursor: pointer;
        border: 1px solid var(--divider-color, #e4e7ec);
        background: var(--card-background-color, #fff);
        color: var(--secondary-text-color, #667085);
        font-size: 12px; font-weight: 600;
      }
      .subtabs button.active {
        color: #fff; border-color: transparent;
        background: linear-gradient(135deg, #5b6cff, #ff4f9a);
      }
      .subtabs button ha-icon { --mdc-icon-size: 17px; }
      .speaker-controls { display: flex; flex-direction: column; gap: 16px; }
      .speaker-control {
        border: 1px solid var(--divider-color, #e4e7ec); border-radius: 22px;
        background: var(--card-background-color, #fff); padding: 18px;
      }
      .speaker-control-head { display: flex; align-items: center; gap: 12px; }
      .speaker-control-head h3 { margin: 0 0 3px; font-size: 17px; }
      .speaker-control-head p { margin: 0; font-size: 11px; }
      .speaker-grid {
        display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
        gap: 12px; margin-top: 16px;
      }
      .control-block {
        display: flex; flex-direction: column; gap: 8px;
        border: 1px solid var(--divider-color, #e4e7ec);
        border-radius: 16px; padding: 12px;
        background: var(--secondary-background-color, #f7f8fc);
      }
      .control-block h4 { margin: 0; font-size: 12px; }
      .control-block p { margin: 0; font-size: 11px; }
      .control-block label { display: flex; flex-direction: column; gap: 5px; font-size: 11px; color: var(--secondary-text-color, #667085); }
      .control-block textarea {
        min-height: 58px; resize: vertical; border-radius: 10px;
        border: 1px solid var(--divider-color, #e4e7ec);
        background: var(--card-background-color, #fff); color: inherit;
        padding: 8px 10px; font: inherit; font-size: 12px;
      }
      .control-line { display: flex; align-items: center; gap: 8px; }
      .control-line input[type="range"] { flex: 1; accent-color: var(--primary-color, #5b6cff); }
      .action-btn {
        border: 0; border-radius: 10px; padding: 8px 12px; cursor: pointer;
        background: linear-gradient(135deg, #5b6cff, #ff4f9a); color: #fff;
        font-size: 11px; font-weight: 700;
      }
      .action-btn:hover { filter: brightness(1.08); }
      .ghost-btn {
        align-self: flex-start; border: 1px solid var(--divider-color, #e4e7ec);
        border-radius: 9px; padding: 6px 10px; background: transparent;
        color: inherit; font-size: 11px; cursor: pointer;
      }
      .ghost-btn:hover { border-color: var(--primary-color, #5b6cff); }
      .lyrics-preview {
        width: 100%; aspect-ratio: 16 / 9; object-fit: cover;
        border-radius: 12px; background: #101018;
      }
      .chat-line { display: flex; gap: 6px; }
      .chat-line input {
        flex: 1; min-width: 0; border: 1px solid var(--divider-color, #e4e7ec);
        border-radius: 9px; padding: 7px 9px; background: var(--card-background-color, #fff);
        color: inherit; font: inherit; font-size: 11px;
      }
      .chat-response { min-height: 16px; font-size: 11px; color: var(--secondary-text-color, #667085); }
      .control-status { min-height: 16px; margin-top: 8px; font-size: 11px; color: var(--secondary-text-color, #667085); }
      .sensor-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; }
      .sensor-tile {
        display: flex; flex-direction: column; gap: 2px;
        border-radius: 10px; padding: 8px;
        background: var(--card-background-color, #fff);
        border: 1px solid var(--divider-color, #e4e7ec);
      }
      .sensor-tile span { font-size: 9px; color: var(--secondary-text-color, #667085); }
      .sensor-tile b { font-size: 13px; }
      .speaker-note { display: flex; gap: 10px; align-items: flex-start; margin-top: 16px; }
      .speaker-note ha-icon { color: var(--primary-color, #5b6cff); flex: none; }
      .speaker-note a { color: var(--primary-color, #5b6cff); }
      .music-search { margin-top: 14px; display: flex; flex-direction: column; gap: 8px; }
      .search-row { display: flex; gap: 8px; }
      .search-row input {
        flex: 1; min-width: 0; border: 1px solid var(--divider-color, #e4e7ec);
        border-radius: 10px; padding: 9px 11px; background: rgba(255,255,255,.7);
        color: inherit; font: inherit; font-size: 12px;
      }
      .music-results { display: flex; flex-direction: column; gap: 6px; max-height: 240px; overflow: auto; }
      .music-result {
        display: flex; align-items: center; gap: 9px; width: 100%;
        border: 1px solid var(--divider-color, #e4e7ec); border-radius: 11px;
        background: rgba(255,255,255,.65); padding: 7px 9px; text-align: left;
        color: inherit; cursor: pointer;
      }
      .music-result:hover { border-color: var(--primary-color, #5b6cff); }
      .music-result img { width: 36px; height: 36px; border-radius: 8px; object-fit: cover; flex: none; background: #101018; }
      .music-result span { display: flex; flex-direction: column; gap: 1px; flex: 1; min-width: 0; }
      .music-result b { font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .music-result small { font-size: 10px; color: var(--secondary-text-color, #667085); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .music-result ha-icon { color: var(--primary-color, #5b6cff); }
      .music-hint { font-size: 11px; color: var(--secondary-text-color, #667085); padding: 6px 2px; }
      .mode-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
      .mode-btn {
        display: inline-flex; align-items: center; gap: 6px;
        border: 1px solid var(--divider-color, #e4e7ec); border-radius: 9px;
        background: transparent; color: inherit; padding: 7px 10px;
        font-size: 11px; cursor: pointer;
      }
      .mode-btn.active { border-color: var(--primary-color, #5b6cff); color: var(--primary-color, #5b6cff); background: rgba(91,108,255,.08); }
      .mode-row select {
        border: 1px solid var(--divider-color, #e4e7ec); border-radius: 9px;
        padding: 7px 9px; background: var(--card-background-color, #fff);
        color: inherit; font-size: 11px;
      }
      .music-hub {
        margin-bottom: 20px; padding: 18px; border-radius: 26px;
        background:
          radial-gradient(circle at 0% 0%, rgba(108,124,255,.32), transparent 42%),
          radial-gradient(circle at 100% 0%, rgba(255,79,154,.18), transparent 38%),
          linear-gradient(180deg, #171b2b, #0d101b);
        border: 1px solid rgba(255,255,255,.12);
        color: #eef0ff;
        box-shadow: 0 20px 50px rgba(0,0,0,.18);
      }
      .music-hub.compact { margin-top: 16px; margin-bottom: 0; box-shadow: none; }
      .music-hub-head { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; }
      .music-hub-head h3 { margin: 0 0 4px; font-size: 18px; color: #fff; }
      .music-hub-head p { margin: 0; font-size: 12px; color: rgba(238,240,255,.58); }
      .music-hub-head select {
        border: 1px solid rgba(255,255,255,.16); border-radius: 10px;
        background: rgba(255,255,255,.08); color: #eef0ff; padding: 8px 10px;
        font-size: 11px; max-width: 220px;
      }
      .music-search-bar { display: flex; gap: 8px; margin-top: 14px; }
      .music-search-bar input {
        flex: 1; min-width: 0; border: 1px solid rgba(255,255,255,.16);
        border-radius: 11px; padding: 10px 12px; background: rgba(255,255,255,.08);
        color: #eef0ff; font: inherit; font-size: 12px; outline: none;
      }
      .music-search-bar input:focus { border-color: rgba(108,124,255,.8); }
      .music-search-bar .action-btn { flex: none; }
      .music-tabs { display: flex; gap: 6px; margin-top: 12px; flex-wrap: wrap; }
      .music-tabs button {
        border: 1px solid rgba(255,255,255,.14); border-radius: 10px;
        background: transparent; color: rgba(238,240,255,.68);
        padding: 7px 11px; font-size: 11px; cursor: pointer;
      }
      .music-tabs button.active {
        background: linear-gradient(135deg, #6c7cff, #ff4f9a);
        border-color: transparent; color: #fff;
      }
      .music-tabs b { font-weight: 700; }
      .music-content { margin-top: 12px; max-height: 390px; overflow: auto; padding-right: 4px; }
      .track-list { display: flex; flex-direction: column; gap: 6px; }
      .track-row {
        display: flex; align-items: center; gap: 9px; padding: 7px 9px;
        border-radius: 12px; background: rgba(255,255,255,.06);
        border: 1px solid rgba(255,255,255,.07); cursor: pointer;
      }
      .track-row.current {
        border-color: rgba(108,124,255,.8);
        background: rgba(108,124,255,.16);
      }
      .track-cover {
        width: 40px; height: 40px; border-radius: 9px; object-fit: cover;
        flex: none; background: #101018;
      }
      .track-meta { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
      .track-meta b { font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .track-meta small { font-size: 10px; color: rgba(238,240,255,.55); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .track-duration { font-size: 10px; color: rgba(238,240,255,.5); }
      .track-btn {
        width: 30px; height: 30px; border-radius: 9px; flex: none;
        border: 1px solid rgba(255,255,255,.14); background: transparent;
        color: #eef0ff; cursor: pointer; display: grid; place-items: center;
      }
      .track-btn:hover { border-color: #8f9bff; color: #b9c2ff; }
      .queue-head { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
      .playlist-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px; }
      .playlist-card {
        display: flex; flex-direction: column; gap: 6px; padding: 8px;
        border: 1px solid rgba(255,255,255,.1); border-radius: 14px;
        background: rgba(255,255,255,.06); color: #eef0ff; text-align: left; cursor: pointer;
      }
      .playlist-card:hover { border-color: rgba(108,124,255,.8); }
      .playlist-card img { width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: 10px; background: #101018; }
      .playlist-card b { font-size: 11px; }
      .playlist-card small { font-size: 10px; color: rgba(238,240,255,.55); }
      .playlist-head { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; font-size: 12px; }
      .skin-picker {
        display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
        margin-top: 13px; padding-top: 12px;
        border-top: 1px solid rgba(255,255,255,.09);
        font-size: 11px; color: rgba(238,240,255,.55);
      }
      .skin-picker button {
        width: 27px; height: 27px; border-radius: 8px;
        border: 1px solid rgba(255,255,255,.16); background: transparent;
        color: #eef0ff; cursor: pointer; font-size: 11px;
      }
      .skin-picker button.active {
        background: linear-gradient(135deg, #5b6cff, #ff4f9a);
        border-color: transparent; color: #fff;
      }
      .skin-picker b { color: #fff; font-weight: 600; }
      .music-hint { font-size: 11px; color: rgba(238,240,255,.55); padding: 8px 2px; }
      .music-hint.notice { color: #9facff; }
      .error-text { color: #ff8da1; }
      .full-player,
      .player.full.full-player {
        position: relative; overflow: hidden; border-radius: 32px;
        color: #fff; background: #080a12; padding: 0; border: 0;
        min-height: 620px;
        box-shadow: 0 40px 100px rgba(0,0,0,.55);
      }
      .player.full.full-player .player-cover.big {
        width: 100%; height: auto; aspect-ratio: 1;
      }
      .player.full.full-player .player-cover.big img { border-radius: 24px; }
      .player.full.full-player .full-viz .viz { height: 100%; }
      .full-bg {
        position: absolute; inset: -30px;
        background-image: var(--cover);
        background-size: cover; background-position: center;
        filter: blur(38px) brightness(.56) saturate(1.25);
        transform: scale(1.12);
      }
      .full-shade {
        position: absolute; inset: 0;
        background:
          radial-gradient(circle at 15% 5%, rgba(108,124,255,.18), transparent 38%),
          linear-gradient(180deg, rgba(5,6,15,.24), rgba(5,6,15,.62) 52%, rgba(5,6,15,.88));
      }
      .full-content {
        position: relative; z-index: 1; padding: 24px;
        display: flex; flex-direction: column; gap: 14px;
      }
      .full-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; }
      .full-kicker { font-size: 10px; letter-spacing: .14em; text-transform: uppercase; color: rgba(255,255,255,.55); }
      .full-title h2 { margin: 5px 0 4px; font-size: 28px; line-height: 1.12; }
      .full-title p { margin: 0; font-size: 13px; color: rgba(255,255,255,.66); }
      .full-actions { display: flex; gap: 8px; }
      .round-btn {
        width: 38px; height: 38px; border-radius: 50%;
        border: 1px solid rgba(255,255,255,.18);
        background: rgba(255,255,255,.1); color: #fff;
        display: grid; place-items: center; cursor: pointer;
      }
      .round-btn:hover { background: rgba(255,255,255,.18); }
      .full-main {
        display: grid; grid-template-columns: minmax(280px, 380px) 1fr;
        gap: 22px; align-items: center;
      }
      .full-cover-wrap { min-width: 0; }
      .full-player .player-cover.big {
        width: 100%; height: auto; aspect-ratio: 1; border-radius: 24px;
        box-shadow: 0 26px 70px rgba(0,0,0,.5);
      }
      .full-side { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
      .full-viz {
        height: 150px; display: flex; align-items: stretch;
        padding: 12px; border-radius: 18px;
        background: rgba(255,255,255,.06);
        border: 1px solid rgba(255,255,255,.08);
      }
      .full-viz .viz { flex: 1; height: 100%; background: transparent; padding: 0; }
      .full-viz-switch { display: flex; flex-wrap: wrap; gap: 4px; justify-content: flex-end; }
      .full-viz-switch button {
        width: 29px; height: 29px; border-radius: 8px;
        border: 1px solid rgba(255,255,255,.14); background: transparent;
        color: rgba(255,255,255,.7); cursor: pointer;
      }
      .full-viz-switch button.active {
        background: linear-gradient(135deg, #5b6cff, #ff4f9a);
        border-color: transparent; color: #fff;
      }
      .full-modes { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
      .full-modes .mode-btn { color: rgba(255,255,255,.75); border-color: rgba(255,255,255,.14); }
      .full-modes .mode-btn.active { color: #fff; border-color: #8f9bff; background: rgba(108,124,255,.2); }
      .full-modes select {
        border: 1px solid rgba(255,255,255,.14); border-radius: 9px;
        background: rgba(255,255,255,.08); color: #fff; padding: 7px 9px; font-size: 11px;
      }
      .full-seek input[type="range"] { width: 100%; accent-color: #8f9bff; }
      .full-seek .times { color: rgba(255,255,255,.6); }
      .full-controls { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
      .full-controls .transport { display: flex; align-items: center; gap: 8px; }
      .full-controls .icon-btn {
        width: 44px; height: 44px; border-radius: 14px;
        background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.14);
        color: #fff;
      }
      .full-controls .icon-btn.play {
        width: 56px; height: 56px; border-radius: 18px; border: 0;
        background: linear-gradient(135deg, #5b6cff, #ff4f9a); color: #fff;
        box-shadow: 0 10px 28px rgba(91,108,255,.36);
      }
      .full-controls .volume-control { flex: 1; min-width: 180px; color: rgba(255,255,255,.7); }
      .full-controls .volume-toggle { color: #fff; }
      .full-player .lyrics-sync { color: rgba(255,255,255,.6); }
      .full-player .lyrics-sync b { color: #fff; }
      .full-player .sync-btn { border-color: rgba(255,255,255,.18); color: #fff; }
      .full-player .sync-btn:hover { border-color: #8f9bff; color: #b9c2ff; }
      .full-player .music-hub { margin-top: 4px; }

      /* Video mode and mini-player */
      .player-cover .video-chip {
        position: absolute; left: 8px; bottom: 8px; z-index: 2;
        display: inline-flex; align-items: center; gap: 5px;
        padding: 4px 8px; border-radius: 8px;
        background: rgba(0,0,0,.66); color: #fff;
        font-size: 10px; font-weight: 700; letter-spacing: .04em;
        backdrop-filter: blur(6px);
      }
      .player-cover .video-chip ha-icon { --mdc-icon-size: 14px; }
      .player.video-mode .player-cover {
        width: min(220px, 38vw); height: auto; aspect-ratio: 16 / 9;
        border-radius: 18px;
      }
      .player.video-mode .player-cover img { object-fit: cover; }
      .player.video-mode.playing .player-cover img { animation: none; }
      .player.full.video-mode .full-main {
        grid-template-columns: minmax(0, 1fr);
        width: 100%; max-width: 1080px; margin: 0 auto;
      }
      .player.full.video-mode .full-side { display: none; }
      .player.full.video-mode .full-cover-wrap {
        width: 100%; max-width: 1000px; margin: 0 auto;
      }
      .player.full.video-mode .player-cover.big {
        width: 100%; height: auto; aspect-ratio: 16 / 9; border-radius: 24px;
      }
      .player.full.video-mode .player-cover.big img {
        border-radius: 24px; object-fit: cover;
      }
      .player.full.video-mode .lyrics-overlay,
      .player.full.video-mode .lyrics-sync { display: none; }
      .video-hub {
        margin-top: 4px; padding: 16px; border-radius: 20px;
        background:
          radial-gradient(circle at 0% 0%, rgba(255,59,48,.16), transparent 46%),
          linear-gradient(180deg, rgba(23,27,43,.96), rgba(13,16,27,.96));
        border: 1px solid rgba(255,255,255,.12); color: #eef0ff;
      }
      .video-hub.active {
        border-color: rgba(255,99,132,.42);
        box-shadow: 0 0 0 1px rgba(255,99,132,.12) inset;
      }
      .video-hub-head {
        display: flex; align-items: flex-start; justify-content: space-between;
        gap: 14px;
      }
      .video-hub-title { min-width: 0; }
      .video-badge {
        display: inline-flex; align-items: center; gap: 7px;
        font-size: 10px; letter-spacing: .12em; text-transform: uppercase;
        color: #ff9aa8; font-weight: 700;
      }
      .video-hub-title p {
        margin: 7px 0 0; font-size: 12px; line-height: 1.45;
        color: rgba(238,240,255,.62);
      }
      .video-open {
        display: inline-flex; align-items: center; gap: 6px;
        padding: 8px 11px; border-radius: 10px; white-space: nowrap;
        border: 1px solid rgba(255,255,255,.16); color: #fff;
        text-decoration: none; font-size: 11px;
      }
      .video-open:hover { border-color: #ff8fa3; color: #ffd7de; }
      .video-form { display: flex; gap: 8px; margin-top: 13px; flex-wrap: wrap; }
      .video-form input {
        flex: 1; min-width: 220px; height: 40px; padding: 0 12px;
        border-radius: 11px; border: 1px solid rgba(255,255,255,.16);
        background: rgba(0,0,0,.28); color: #fff; font: inherit; font-size: 12px;
        outline: none;
      }
      .video-form input:focus { border-color: rgba(255,99,132,.7); }
      .video-play {
        display: inline-flex; align-items: center; gap: 7px;
        height: 40px; padding: 0 16px; border-radius: 11px; border: 0;
        background: linear-gradient(135deg, #ff3b30, #ff4f9a);
        color: #fff; font: inherit; font-size: 12px; font-weight: 700;
        cursor: pointer;
      }
      .video-play:disabled { opacity: .55; cursor: default; }
      .video-services {
        display: flex; gap: 14px; flex-wrap: wrap; margin-top: 10px;
        font-size: 10px; color: rgba(238,240,255,.4);
      }
      .video-status {
        margin-top: 8px; min-height: 14px;
        font-size: 11px; color: #9facff;
      }
      .video-close {
        display: inline-flex; align-items: center; gap: 6px;
        padding: 8px 11px; border-radius: 10px; white-space: nowrap;
        border: 1px solid rgba(255,255,255,.18);
        background: rgba(255,255,255,.08); color: #fff;
        font: inherit; font-size: 11px; cursor: pointer;
      }
      .video-close:hover { border-color: #ff8fa3; color: #ffd7de; }
      .video-close ha-icon { --mdc-icon-size: 16px; }
      .video-close[hidden], .round-btn[hidden] { display: none; }
      .player-badges {
        display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px;
      }
      .alice-live, .live-badge {
        display: inline-flex; align-items: center; gap: 6px;
        padding: 3px 8px; border-radius: 999px;
        font-size: 10px; font-weight: 700; letter-spacing: .03em;
        background: rgba(255,255,255,.08);
        border: 1px solid rgba(255,255,255,.12); color: #dbe4ff;
      }
      .alice-live[hidden], .live-badge[hidden] { display: none; }
      .alice-live i {
        width: 7px; height: 7px; border-radius: 50%;
        background: #7dd3fc; animation: alicePulse 1.4s infinite;
      }
      .alice-live.listening { color: #9be7ff; border-color: rgba(56,189,248,.4); }
      .alice-live.thinking { color: #ffe08a; border-color: rgba(250,204,21,.4); }
      .alice-live.speaking { color: #ffb3c9; border-color: rgba(255,79,154,.4); }
      .alice-live.thinking i { background: #facc15; }
      .alice-live.speaking i { background: #ff4f9a; }
      @keyframes alicePulse {
        0% { box-shadow: 0 0 0 0 rgba(125,211,252,.55); }
        70% { box-shadow: 0 0 0 7px rgba(125,211,252,0); }
        100% { box-shadow: 0 0 0 0 rgba(125,211,252,0); }
      }
      .alice-state.listening { color: #38bdf8; }
      .alice-state.thinking { color: #facc15; }
      .alice-state.speaking { color: #ff6ea9; }
      .engine-badge {
        display: inline-flex; align-items: center;
        padding: 3px 8px; border-radius: 999px;
        font-size: 9px; font-weight: 700; letter-spacing: .04em;
        background: rgba(91,108,255,.12);
        border: 1px solid rgba(91,108,255,.28); color: #b9c2ff;
      }
      .player-topline {
        display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
        margin-bottom: 7px;
      }
      .engine-pill {
        display: inline-flex; align-items: center; gap: 6px;
        padding: 5px 11px; border-radius: 10px;
        background: rgba(91,108,255,.16);
        border: 1px solid rgba(91,108,255,.33);
        color: #fff; white-space: nowrap;
      }
      .engine-pill b { font-size: 12px; font-weight: 800; letter-spacing: .02em; }
      .card-topline { margin-top: 7px; margin-bottom: 0; }
      .engine-pill small {
        font-size: 9px; font-weight: 600; color: rgba(255,255,255,.52);
      }
      .engine-pill ha-icon { --mdc-icon-size: 15px; color: #b9c2ff; }
      .engine-pill.engine-video {
        background: rgba(255,79,154,.15);
        border-color: rgba(255,79,154,.32);
      }
      .engine-pill.engine-video ha-icon { color: #ff9ab8; }
      .engine-pill.engine-radio {
        background: rgba(34,197,94,.13);
        border-color: rgba(34,197,94,.32);
      }
      .engine-pill.engine-radio ha-icon { color: #7ee2a8; }
      .engine-pill.engine-idle {
        background: rgba(255,255,255,.06);
        border-color: rgba(255,255,255,.12);
      }
      .alice-live { white-space: nowrap; }
      .alice-live.idle {
        color: rgba(255,255,255,.55);
        border-color: rgba(255,255,255,.12);
      }
      .alice-live.idle i {
        background: rgba(255,255,255,.38); animation: none;
      }
      .player-badges:empty { display: none; }
      .quality-switch {
        display: inline-flex; align-items: center; gap: 4px;
        padding: 4px; border-radius: 12px;
        background: rgba(255,255,255,.06);
        border: 1px solid rgba(255,255,255,.12);
      }
      .quality-switch .quality-label {
        display: inline-flex; align-items: center; gap: 5px;
        padding: 0 6px; font-size: 10px;
        color: rgba(255,255,255,.55); white-space: nowrap;
      }
      .quality-switch .quality-label ha-icon { --mdc-icon-size: 14px; }
      .quality-switch button {
        border: 0; background: transparent; color: rgba(255,255,255,.62);
        font: inherit; font-size: 10px; padding: 6px 9px;
        border-radius: 9px; cursor: pointer; white-space: nowrap;
      }
      .quality-switch button.active {
        background: linear-gradient(135deg, #5b6cff, #ff4f9a);
        color: #fff; font-weight: 700;
        box-shadow: 0 6px 14px rgba(91,108,255,.25);
      }
      .quality-control {
        display: inline-flex; align-items: center; gap: 6px;
        padding: 4px 8px; border-radius: 10px;
        border: 1px solid rgba(255,255,255,.14);
        background: rgba(255,255,255,.06);
        color: rgba(255,255,255,.75); font-size: 10px;
      }
      .quality-control select {
        border: 0; background: transparent; color: #fff;
        font: inherit; font-size: 11px; outline: none;
      }
      .quality-control ha-icon { --mdc-icon-size: 15px; }
      .full-quality span { color: rgba(255,255,255,.55); }
      .player.radio-mode .player-seek { display: none; }
      .player.radio-mode .full-modes .mode-btn,
      .player.radio-mode .full-modes select[data-repeat] { display: none; }
      .player.video-mode .player-content > .viz { display: none; }
      .live-badge { color: #ffb3c9; border-color: rgba(255,79,154,.35); }
      .live-badge ha-icon { --mdc-icon-size: 14px; }
      .radio-card {
        display: flex; align-items: center; gap: 12px;
        padding: 12px 14px; margin: 2px 0 4px; border-radius: 16px;
        background: linear-gradient(135deg, rgba(255,79,154,.16), rgba(91,108,255,.14));
        border: 1px solid rgba(255,255,255,.12); color: #fff;
      }
      .radio-card[hidden] { display: none; }
      .radio-card > ha-icon { --mdc-icon-size: 28px; color: #ff8fb1; }
      .radio-copy {
        flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px;
      }
      .radio-copy span {
        font-size: 9px; letter-spacing: .14em; text-transform: uppercase;
        color: #ff9aa8; font-weight: 700;
      }
      .radio-copy b {
        font-size: 14px; white-space: nowrap; overflow: hidden;
        text-overflow: ellipsis;
      }
      .radio-bars { display: flex; align-items: flex-end; gap: 3px; height: 26px; }
      .radio-bars i {
        width: 3px; height: 40%; border-radius: 2px;
        background: linear-gradient(180deg, #ff8fb1, #7c9cff);
        animation: radioBar 1.2s ease-in-out infinite;
      }
      .radio-bars i:nth-child(2) { animation-delay: .15s; }
      .radio-bars i:nth-child(3) { animation-delay: .3s; }
      .radio-bars i:nth-child(4) { animation-delay: .45s; }
      .radio-bars i:nth-child(5) { animation-delay: .6s; }
      @keyframes radioBar {
        0%, 100% { height: 25%; }
        50% { height: 100%; }
      }
      .test-live {
        display: flex; align-items: center; gap: 10px;
        margin: 10px 0; padding: 10px 12px; border-radius: 12px;
        background: rgba(255,255,255,.05);
        border: 1px solid rgba(255,255,255,.08);
      }
      .test-live > ha-icon { color: #ff8fb1; }
      .test-live-copy { flex: 1; display: flex; flex-direction: column; gap: 2px; }
      .test-live-copy span {
        font-size: 9px; letter-spacing: .12em; text-transform: uppercase;
        color: #ff9aa8; font-weight: 700;
      }
      .test-live-copy b { font-size: 13px; color: #fff; }
      .test-live-copy small { font-size: 11px; color: rgba(255,255,255,.55); }
      .test-live .radio-bars { height: 22px; }
      .speaker-settings {
        margin-top: 18px; padding-top: 16px;
        border-top: 1px solid rgba(255,255,255,.12);
      }
      .settings-head {
        display: flex; justify-content: space-between; align-items: flex-start;
        gap: 12px; margin-bottom: 10px;
      }
      .settings-head h4 { margin: 0 0 4px; color: #fff; }
      .settings-head p { margin: 0; font-size: 12px; }
      .settings-loading {
        display: flex; align-items: center; gap: 10px; padding: 18px;
        color: rgba(238,240,255,.6); font-size: 12px;
      }
      .settings-panel {
        padding: 0; background: transparent; border: 0; box-shadow: none;
      }
      .settings-panel .test-grid {
        grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      }
      .settings-collapse-bar {
        display: flex; justify-content: flex-end; margin: 0 0 8px;
      }
      details.settings-group { padding: 0; overflow: hidden; }
      details.settings-group > summary {
        display: flex; align-items: center; justify-content: space-between;
        gap: 10px; padding: 14px 16px; cursor: pointer;
        list-style: none;
      }
      details.settings-group > summary::-webkit-details-marker { display: none; }
      details.settings-group > summary h4 { margin: 0; }
      details.settings-group > summary::after {
        content: "⌄"; font-size: 16px; color: rgba(255,255,255,.55);
        transition: transform .15s ease;
      }
      details.settings-group[open] > summary::after { transform: rotate(180deg); }
      details.settings-group[open] > summary { border-bottom: 1px solid rgba(255,255,255,.08); }
      details.settings-group > *:not(summary) { margin-left: 16px; margin-right: 16px; }
      details.settings-group > *:last-child { margin-bottom: 16px; }
      .station-settings { margin-top: 0; }
      .settings-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(255px, 1fr));
        gap: 12px;
      }
      .settings-card {
        display: flex; flex-direction: column; gap: 9px;
        padding: 14px; border-radius: 16px;
        background: linear-gradient(180deg, rgba(255,255,255,.065), rgba(255,255,255,.025));
        border: 1px solid rgba(255,255,255,.09);
      }
      .settings-card-head {
        display: flex; align-items: center; gap: 8px;
      }
      .settings-card-head h5 {
        margin: 0; font-size: 12px; font-weight: 800;
        letter-spacing: .02em; color: #fff;
      }
      .settings-card-head ha-icon {
        --mdc-icon-size: 17px; color: #8f9bff;
      }
      .settings-status-row, .settings-row {
        display: flex; align-items: center; justify-content: space-between;
        gap: 10px; font-size: 11px; color: rgba(238,240,255,.6);
      }
      .settings-status-row b {
        color: #fff; font-weight: 700; text-align: right;
      }
      .settings-status-row b small {
        color: rgba(238,240,255,.4); font-size: 9px; font-weight: 600;
      }
      .settings-switch {
        display: flex; align-items: center; gap: 8px;
        font-size: 11px; color: rgba(238,240,255,.7);
      }
      .settings-switch input {
        width: 16px; height: 16px; accent-color: #6c7cff; flex: none;
      }
      .settings-switch b {
        margin-left: auto; color: #fff; font-size: 10px; font-weight: 700;
      }
      .settings-switch.warning b { color: #ffb3c9; }
      .settings-select, .settings-input, .settings-time {
        background: rgba(0,0,0,.25);
        border: 1px solid rgba(255,255,255,.14);
        border-radius: 9px; color: #fff;
        padding: 7px 9px; font: inherit; font-size: 11px;
        max-width: 160px;
      }
      .settings-input { max-width: 145px; }
      .settings-time { max-width: 110px; }
      .settings-row-2 {
        display: grid; grid-template-columns: 1fr 1fr; gap: 8px;
      }
      .settings-row-2 .settings-row { flex-direction: column; align-items: stretch; gap: 4px; }
      .settings-row-2 .settings-input { max-width: none; width: 100%; }
      .settings-btn {
        align-self: flex-start;
        border: 1px solid rgba(255,255,255,.16);
        background: rgba(255,255,255,.07);
        color: #fff; border-radius: 9px;
        padding: 7px 10px; font: inherit; font-size: 10px;
        cursor: pointer;
      }
      .settings-btn:hover { border-color: #8f9bff; color: #dfe4ff; }
      .settings-btn:disabled { opacity: .45; cursor: default; }
      .settings-actions { display: flex; gap: 6px; flex-wrap: wrap; }
      .settings-actions .settings-btn { align-self: auto; }
      .settings-hint {
        font-size: 10px; line-height: 1.45;
        color: rgba(238,240,255,.42);
      }
      .settings-live {
        display: flex; align-items: center; gap: 9px;
        padding: 9px 10px; border-radius: 12px;
        background: rgba(255,255,255,.045);
        border: 1px solid rgba(255,255,255,.08);
      }
      .settings-live > ha-icon { color: rgba(255,255,255,.45); }
      .settings-live.active > ha-icon { color: #ff8fb1; }
      .settings-live div { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
      .settings-live span {
        font-size: 9px; letter-spacing: .1em; text-transform: uppercase;
        color: #ff9aa8; font-weight: 700;
      }
      .settings-live b {
        font-size: 12px; color: #fff; font-weight: 700;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .settings-live small { font-size: 10px; color: rgba(255,255,255,.5); }
      .icon-btn.stop { color: #ff9aa8; }
      .icon-btn.stop:disabled { opacity: .45; cursor: default; }
      .mini-controls button[hidden] { display: none; }
      .mini-player {
        position: fixed; left: 50%; bottom: 18px; transform: translateX(-50%);
        z-index: 90; width: min(880px, calc(100vw - 36px));
        display: flex; align-items: center; gap: 14px;
        padding: 10px 14px 13px; border-radius: 18px;
        background: rgba(10,12,20,.94);
        border: 1px solid rgba(255,255,255,.14);
        box-shadow: 0 18px 54px rgba(0,0,0,.58);
        backdrop-filter: blur(18px); color: #fff;
      }
      .mini-player[hidden] { display: none; }
      .mini-cover {
        position: relative; flex: 0 0 118px; width: 118px; aspect-ratio: 16 / 9;
        padding: 0; border: 0; border-radius: 12px; overflow: hidden;
        background: #101018; cursor: pointer;
      }
      .mini-cover img {
        width: 100%; height: 100%; object-fit: cover; display: block;
      }
      .mini-badge {
        position: absolute; left: 6px; bottom: 6px;
        width: 24px; height: 24px; border-radius: 8px;
        display: grid; place-items: center;
        background: rgba(0,0,0,.66); color: #fff;
      }
      .mini-badge ha-icon { --mdc-icon-size: 16px; }
      .mini-info {
        min-width: 0; flex: 1; display: flex; flex-direction: column;
        gap: 2px; cursor: pointer;
      }
      .mini-kicker {
        font-size: 9px; letter-spacing: .12em; text-transform: uppercase;
        color: #ff9aa8; font-weight: 700;
      }
      .mini-info b {
        font-size: 14px; white-space: nowrap; overflow: hidden;
        text-overflow: ellipsis;
      }
      .mini-meta {
        font-size: 11px; color: rgba(255,255,255,.58);
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .alice-live.mini-alice {
        align-self: flex-start; padding: 2px 6px; font-size: 9px;
      }
      .mini-controls { display: flex; align-items: center; gap: 6px; }
      .mini-controls button {
        width: 34px; height: 34px; border-radius: 10px;
        border: 1px solid rgba(255,255,255,.14);
        background: rgba(255,255,255,.06); color: #fff;
        display: grid; place-items: center; cursor: pointer;
      }
      .mini-controls button:hover { background: rgba(255,255,255,.13); }
      .mini-controls .mini-play {
        width: 42px; height: 42px; border-radius: 12px; border: 0;
        background: linear-gradient(135deg, #5b6cff, #ff4f9a);
      }
      .mini-progress {
        position: absolute; left: 14px; right: 14px; bottom: 6px;
        height: 3px; border-radius: 3px; overflow: hidden;
        background: rgba(255,255,255,.12);
      }
      .mini-progress span {
        display: block; width: 0; height: 100%;
        background: linear-gradient(90deg, #5b6cff, #ff4f9a);
        transition: width .3s linear;
      }
      .shell.has-mini-player { padding-bottom: 132px; }
      .video-note {
        margin-top: 8px; font-size: 10px; line-height: 1.4;
        color: var(--secondary-text-color, #667085);
      }
      .ha-video-modal {
        position: fixed; inset: 0; z-index: 200;
        display: grid; place-items: center; padding: 24px;
      }
      .ha-video-backdrop {
        position: absolute; inset: 0; background: rgba(4, 6, 12, .78);
        backdrop-filter: blur(6px);
      }
      .ha-video-body {
        position: relative; z-index: 1; width: min(1100px, 100%);
        border-radius: 22px; overflow: hidden;
        background: #0b0e17; border: 1px solid rgba(255,255,255,.14);
        box-shadow: 0 30px 90px rgba(0,0,0,.7); color: #fff;
      }
      .ha-video-head {
        display: flex; align-items: center; justify-content: space-between;
        gap: 12px; padding: 14px 16px;
        border-bottom: 1px solid rgba(255,255,255,.1);
      }
      .ha-video-head b { display: block; font-size: 15px; }
      .ha-video-head span { display: block; margin-top: 3px; font-size: 11px; color: rgba(255,255,255,.55); }
      .ha-video-close {
        flex: none; width: 36px; height: 36px; border-radius: 10px;
        border: 1px solid rgba(255,255,255,.14);
        background: rgba(255,255,255,.06); color: #fff; cursor: pointer;
        display: grid; place-items: center;
      }
      .ha-video-frame { aspect-ratio: 16 / 9; background: #000; }
      .ha-video-frame iframe, .ha-video-frame video {
        width: 100%; height: 100%; border: 0; display: block;
      }
      .ha-video-note {
        display: grid; place-items: center; height: 100%;
        padding: 24px; text-align: center; font-size: 14px;
        color: rgba(255,255,255,.7);
      }
      .ha-video-foot {
        display: flex; align-items: center; justify-content: space-between;
        gap: 12px; padding: 11px 16px; font-size: 11px;
        color: rgba(255,255,255,.55);
      }
      .ha-video-foot a { color: #b9c2ff; }
      @media (max-width: 720px) {
        .ha-video-modal { padding: 10px; }
        .ha-video-frame { aspect-ratio: 16 / 10; }
      }
      @media (max-width: 720px) {
        .mini-player { gap: 10px; padding: 8px 10px 11px; bottom: 10px; }
        .mini-cover { flex-basis: 88px; width: 88px; }
        .mini-controls button[data-player-action="previous"],
        .mini-controls button[data-player-action="next"] { display: none; }
        .shell.has-mini-player { padding-bottom: 120px; }
      }
      .speaker-control {
        background: linear-gradient(180deg, #171b2b, #0d101b);
        color: #eef0ff; border-color: rgba(255,255,255,.12);
      }
      .speaker-control .muted { color: rgba(238,240,255,.55); }
      .speaker-control .control-block {
        background: rgba(255,255,255,.06); border-color: rgba(255,255,255,.09);
      }
      .speaker-control .control-block h4,
      .speaker-control .control-block p,
      .speaker-control .control-block label { color: rgba(238,240,255,.8); }
      .speaker-control .control-block select,
      .speaker-control .control-block input,
      .speaker-control .control-block textarea {
        background: rgba(255,255,255,.08); color: #eef0ff; border-color: rgba(255,255,255,.14);
      }
      .speaker-control .ghost-btn { color: #eef0ff; border-color: rgba(255,255,255,.16); }
      .speaker-control .sensor-tile { background: rgba(255,255,255,.06); border-color: rgba(255,255,255,.09); }
      .player {
        --skin-accent: #6c7cff;
        --skin-accent-2: #ff4f9a;
      }
      .player .icon-btn.play,
      .player .viz-bars span,
      .player .viz-wave span,
      .player .viz-dots span,
      .player .viz-spectrum span,
      .player .viz-mirror span,
      .player .viz-blocks span {
        background: linear-gradient(135deg, var(--skin-accent), var(--skin-accent-2));
      }
      .player.skin-2 { --skin-accent: #7c8cff; --skin-accent-2: #4fd1ff; }
      .player.skin-3 { --skin-accent: #f2b35e; --skin-accent-2: #ff7a59; }
      .player.skin-4 { --skin-accent: #8be9fd; --skin-accent-2: #c084fc; }
      .player.skin-5 { --skin-accent: #ff3df2; --skin-accent-2: #39e7ff; }
      .player.skin-6 { --skin-accent: #111827; --skin-accent-2: #6b7280; }
      .player.skin-7 { --skin-accent: #37d39a; --skin-accent-2: #6c7cff; }
      .player.skin-8 { --skin-accent: #d6b36a; --skin-accent-2: #b08b46; }
      .full-player {
        --skin-accent: #6c7cff;
        --skin-accent-2: #ff4f9a;
        --skin-text: #fff;
        --skin-muted: rgba(255,255,255,.6);
      }
      .full-player .full-title h2 { color: var(--skin-text); }
      .full-player .full-title p,
      .full-player .full-kicker { color: var(--skin-muted); }
      .full-player .full-controls .icon-btn.play,
      .full-player .full-viz-switch button.active {
        background: linear-gradient(135deg, var(--skin-accent), var(--skin-accent-2));
      }
      .full-player .viz-bars span,
      .full-player .viz-wave span,
      .full-player .viz-dots span,
      .full-player .viz-radial span,
      .full-player .viz-tunnel span,
      .full-player .viz-blocks span {
        background: linear-gradient(to top, var(--skin-accent), var(--skin-accent-2));
      }
      .full-player .viz-wave-line .wave-a { stroke: var(--skin-accent); }
      .full-player .viz-wave-line .wave-b { stroke: var(--skin-accent-2); }
      .full-player .viz-ekg path { stroke: var(--skin-accent-2); }
      .full-player .viz-rain span {
        background: linear-gradient(to bottom, transparent, var(--skin-accent));
      }
      .full-viz .viz-rings i { width: 112px; height: 112px; }
      .full-viz .viz-rings i:nth-child(2) { width: 86px; height: 86px; }
      .full-viz .viz-rings i:nth-child(3) { width: 60px; height: 60px; }
      .full-viz .viz-rings b { width: 16px; height: 16px; }
      .full-player.skin-1 { --skin-accent: #6c7cff; --skin-accent-2: #ff4f9a; }
      .full-player.skin-2 { --skin-accent: #7c8cff; --skin-accent-2: #4fd1ff; }
      .full-player.skin-2 .full-shade {
        background:
          radial-gradient(circle at 20% 0%, rgba(79,209,255,.18), transparent 40%),
          linear-gradient(180deg, rgba(4,8,20,.45), rgba(4,8,20,.9));
      }
      .full-player.skin-3 {
        --skin-accent: #f2b35e; --skin-accent-2: #ff7a59;
        --skin-text: #fff7ea; --skin-muted: rgba(255,247,234,.6);
      }
      .full-player.skin-3 .full-title h2 { font-family: Georgia, "Times New Roman", serif; }
      .full-player.skin-3 .full-bg { filter: blur(40px) brightness(.3) sepia(.55) saturate(1.2); }
      .full-player.skin-3 .player-cover.big {
        border-radius: 50%;
        box-shadow: 0 0 0 14px rgba(0,0,0,.55), 0 0 0 18px rgba(255,255,255,.1), 0 30px 70px rgba(0,0,0,.55);
      }
      .full-player.skin-4 {
        --skin-accent: #8be9fd; --skin-accent-2: #c084fc;
        --skin-muted: rgba(255,255,255,.66);
      }
      .full-player.skin-4 .full-shade {
        background: linear-gradient(180deg, rgba(20,28,40,.35), rgba(10,15,25,.68));
      }
      .full-player.skin-4 .full-viz,
      .full-player.skin-4 .round-btn,
      .full-player.skin-4 .full-controls .icon-btn {
        backdrop-filter: blur(16px); background: rgba(255,255,255,.12);
      }
      .full-player.skin-5 {
        --skin-accent: #ff3df2; --skin-accent-2: #39e7ff;
        --skin-text: #f5f3ff; --skin-muted: rgba(245,243,255,.62);
      }
      .full-player.skin-5 .full-shade {
        background:
          radial-gradient(circle at 80% 0%, rgba(255,61,242,.2), transparent 40%),
          linear-gradient(180deg, rgba(3,0,10,.5), rgba(3,0,10,.94));
      }
      .full-player.skin-5 .full-viz {
        border: 1px solid rgba(255,61,242,.55);
        box-shadow: 0 0 24px rgba(255,61,242,.22), inset 0 0 24px rgba(57,231,255,.08);
      }
      .full-player.skin-5 .full-title h2 {
        text-transform: uppercase; letter-spacing: .04em;
        text-shadow: 0 0 18px rgba(255,61,242,.65);
      }
      .full-player.skin-5 .full-viz-switch button.active {
        box-shadow: 0 0 14px rgba(255,61,242,.6);
      }
      .full-player.skin-6 {
        --skin-accent: #111827; --skin-accent-2: #6b7280;
        --skin-text: #111827; --skin-muted: rgba(17,24,39,.55);
        background: #f4efe7;
      }
      .full-player.skin-6 .full-bg { display: none; }
      .full-player.skin-6 .full-shade { background: linear-gradient(180deg, #f8f4ed, #eee7dc); }
      .full-player.skin-6 .round-btn,
      .full-player.skin-6 .full-viz-switch button,
      .full-player.skin-6 .full-modes .mode-btn,
      .full-player.skin-6 .full-modes select,
      .full-player.skin-6 .sync-btn {
        color: #111827; border-color: rgba(17,24,39,.18);
        background: rgba(17,24,39,.04);
      }
      .full-player.skin-6 .full-viz { background: rgba(17,24,39,.05); border-color: rgba(17,24,39,.1); }
      .full-player.skin-6 .full-controls .icon-btn {
        background: rgba(17,24,39,.06); border-color: rgba(17,24,39,.16); color: #111827;
      }
      .full-player.skin-6 .full-controls .volume-control,
      .full-player.skin-6 .volume-toggle,
      .full-player.skin-6 .lyrics-sync,
      .full-player.skin-6 .times { color: rgba(17,24,39,.65); }
      .full-player.skin-6 .lyrics-sync b { color: #111827; }
      .full-player.skin-6 .player-cover.big { border-radius: 6px; }
      .full-player.skin-6 .beat-strip,
      .full-player.skin-6 .beat-strip b,
      .full-player.skin-6 .full-skin-row > span,
      .full-player.skin-6 .skin-swatch,
      .full-player.skin-6 .source-switch,
      .full-player.skin-6 .source-switch button,
      .full-player.skin-6 .extra-pill {
        color: rgba(17,24,39,.66);
        border-color: rgba(17,24,39,.16);
        background: rgba(17,24,39,.04);
      }
      .full-player.skin-6 .skin-swatch.active,
      .full-player.skin-6 .source-switch button.active,
      .full-player.skin-6 .extra-pill.active {
        color: #fff; background: linear-gradient(135deg, #111827, #6b7280);
      }
      .full-player.skin-6 .beat-dot { box-shadow: 0 0 0 4px rgba(17,24,39,.08), 0 0 12px rgba(17,24,39,.35); }
      .full-player.skin-7 {
        --skin-accent: #37d39a; --skin-accent-2: #6c7cff;
        --skin-text: #f2fff9; --skin-muted: rgba(242,255,249,.62);
      }
      .full-player.skin-7 .full-shade {
        background: linear-gradient(135deg, rgba(55,211,154,.18), rgba(108,124,255,.18) 45%, rgba(255,79,154,.15));
        background-size: 200% 200%;
        animation: auroraShift 12s ease-in-out infinite alternate;
      }
      @keyframes auroraShift {
        from { background-position: 0% 50%; }
        to { background-position: 100% 50%; }
      }
      .full-player.skin-8 {
        --skin-accent: #d6b36a; --skin-accent-2: #b08b46;
        --skin-text: #f2efe8; --skin-muted: rgba(242,239,232,.6);
      }
      .full-player.skin-8 .full-title h2 {
        font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
        letter-spacing: -.02em;
      }
      .full-player.skin-8 .full-shade {
        background: linear-gradient(180deg, rgba(18,18,18,.6), rgba(8,8,8,.96));
      }
      .full-player.skin-8 .player-cover.big { border-radius: 8px; }
      .full-player.skin-8 .full-viz { border: 1px solid rgba(214,179,106,.35); }

      .viz { position: relative; }
      .viz-wave-line, .viz-ekg { display: block; padding: 0; background: transparent; }
      .viz-wave-line svg, .viz-ekg svg { width: 100%; height: 100%; overflow: visible; }
      .viz-wave-line path {
        fill: none; stroke-width: 3; stroke-linecap: round;
        vector-effect: non-scaling-stroke;
      }
      .wave-a {
        stroke: #6c7cff; stroke-dasharray: 620; stroke-dashoffset: 620;
        animation: waveFlow 3.2s linear infinite;
        filter: drop-shadow(0 0 6px rgba(108,124,255,.6));
      }
      .wave-b {
        stroke: #ff4f9a; stroke-dasharray: 620; stroke-dashoffset: 620;
        animation: waveFlow 3.2s linear infinite reverse; opacity: .8;
      }
      @keyframes waveFlow { to { stroke-dashoffset: 0; } }
      .viz-ekg path {
        fill: none; stroke: #ff4f9a; stroke-width: 2.5;
        stroke-linecap: round; stroke-linejoin: round;
        stroke-dasharray: 520; stroke-dashoffset: 520;
        animation: ekgDraw 2.6s linear infinite;
        filter: drop-shadow(0 0 7px rgba(255,79,154,.6));
      }
      @keyframes ekgDraw { to { stroke-dashoffset: 0; } }
      .viz-dots {
        display: grid; grid-template-columns: repeat(12, 1fr);
        gap: 6px; align-items: center; justify-items: center;
      }
      .viz-dots span {
        width: 6px; height: 6px; border-radius: 50%;
        background: linear-gradient(135deg, #6c7cff, #ff4f9a);
        animation: dotPulse 1.1s ease-in-out infinite alternate;
        animation-delay: var(--d);
      }
      @keyframes dotPulse {
        from { transform: scale(.45); opacity: .4; }
        to { transform: scale(1.35); opacity: 1; }
      }
      .viz-radial { display: grid; place-items: center; }
      .radial-ring { position: relative; width: 84px; height: 84px; }
      .radial-ring span {
        position: absolute; left: 50%; top: 50%; width: 3px;
        height: calc(6px + var(--h) * 0.22px); border-radius: 2px;
        transform-origin: 50% 0;
        transform: translate(-50%, 0) rotate(var(--rot)) scaleY(.7);
        background: linear-gradient(to bottom, #6c7cff, #ff4f9a);
        animation: radialPulse 1.15s ease-in-out infinite alternate;
        animation-delay: calc(var(--i) * -0.03s);
      }
      @keyframes radialPulse {
        from { transform: translate(-50%, 0) rotate(var(--rot)) scaleY(.3); opacity: .45; }
        to { transform: translate(-50%, 0) rotate(var(--rot)) scaleY(1); opacity: 1; }
      }
      .viz-radial b {
        position: absolute; left: 50%; top: 50%;
        width: 12px; height: 12px; border-radius: 50%;
        transform: translate(-50%, -50%);
        background: linear-gradient(135deg, #6c7cff, #ff4f9a);
        box-shadow: 0 0 14px rgba(108,124,255,.6);
      }
      .viz-tunnel {
        display: flex; flex-direction: column; justify-content: center;
        gap: 2px; perspective: 260px;
      }
      .tunnel-row {
        display: flex; align-items: flex-end; gap: 3px; height: 24%;
        width: 100%;
        transform: scale(calc(1 - var(--row) * .12));
        opacity: calc(1 - var(--row) * .18);
      }
      .tunnel-row span {
        flex: 1; height: var(--h); border-radius: 3px;
        background: linear-gradient(to top, #6c7cff, #ff4f9a);
        transform-origin: bottom;
        animation: tunnelPulse 1.2s ease-in-out infinite alternate;
        animation-delay: calc(var(--i) * -0.04s);
      }
      @keyframes tunnelPulse {
        from { transform: scaleY(.6); opacity: .6; }
        to { transform: scaleY(1); opacity: 1; }
      }
      .viz-rings { align-items: center; justify-content: center; }
      .viz-rings i {
        position: absolute; border-radius: 50%; border: 2px solid transparent;
        border-top-color: #6c7cff; width: 70px; height: 70px;
        left: 50%; top: 50%; transform: translate(-50%, -50%);
        animation: ringSpin 2.8s linear infinite;
      }
      .viz-rings i:nth-child(2) { width: 54px; height: 54px; border-top-color: #ff4f9a; animation-duration: 4.2s; animation-direction: reverse; }
      .viz-rings i:nth-child(3) { width: 38px; height: 38px; border-top-color: #37d39a; animation-duration: 5.6s; }
      .viz-rings b {
        width: 12px; height: 12px; border-radius: 50%;
        background: linear-gradient(135deg, #6c7cff, #ff4f9a);
      }
      @keyframes ringSpin { to { transform: translate(-50%, -50%) rotate(360deg); } }
      .viz-rain span {
        position: absolute; top: -22%; width: 3px; height: 18%;
        left: var(--x); border-radius: 2px;
        background: linear-gradient(to bottom, rgba(108,124,255,0), #6c7cff);
        animation: rainFall 1.45s linear infinite;
        animation-delay: var(--d);
      }
      @keyframes rainFall {
        from { transform: translateY(0); opacity: 0; }
        20% { opacity: .9; }
        to { transform: translateY(760%); opacity: 0; }
      }
      .viz-blocks {
        display: grid; grid-template-columns: repeat(12, 1fr);
        grid-auto-rows: 1fr; gap: 4px; align-items: end;
      }
      .viz-blocks span {
        border-radius: 3px; height: var(--h);
        background: linear-gradient(to top, #6c7cff, #ff4f9a);
        transform-origin: bottom;
        animation: blockJump .9s ease-in-out infinite alternate;
        animation-delay: var(--d);
      }
      @keyframes blockJump {
        from { transform: scaleY(.5); opacity: .5; }
        to { transform: scaleY(1); opacity: 1; }
      }
      .full-viz .viz-dots { gap: 8px; }
      .full-viz .viz-dots span { width: 8px; height: 8px; }
      .full-viz .radial-ring { width: 124px; height: 124px; }
      .full-viz .radial-ring span { height: calc(10px + var(--h) * 0.35px); }
      .full-viz .viz-radial b { width: 16px; height: 16px; }
      .full-viz .viz-tunnel { perspective: 400px; }
      .full-viz .viz-blocks { gap: 5px; }
      .card-readings {
        min-height: 42px; margin-top: 10px; display: flex; align-items: center;
        gap: 7px; overflow: hidden; flex-wrap: nowrap;
      }
      .card-readings[data-empty="1"] { min-height: 42px; }
      .card-readings .mini-slider {
        margin-top: 0; flex: 1; min-width: 0; padding: 6px 8px;
      }
      .card-readings .mini-chip { margin-top: 0; flex: none; }
      .card-readings .reading-more {
        flex: none; min-width: 30px; height: 26px; padding: 0 7px;
        border-radius: 999px; display: inline-grid; place-items: center;
        background: var(--secondary-background-color, #f2f4f7);
        color: var(--secondary-text-color, #667085); font-size: 10px; font-weight: 700;
      }
      .card-field-picker {
        display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px;
      }
      .card-field {
        display: inline-flex; align-items: center; gap: 7px;
        border: 1px solid var(--divider-color, #e4e7ec); border-radius: 12px;
        background: var(--secondary-background-color, #f7f8fa);
        color: var(--primary-text-color, #1f2430); padding: 8px 10px;
        font: inherit; font-size: 11px; cursor: pointer;
      }
      .card-field ha-icon { --mdc-icon-size: 16px; color: var(--secondary-text-color, #667085); }
      .card-field b {
        font-size: 10px; color: var(--secondary-text-color, #667085);
        background: var(--card-background-color, #fff); padding: 2px 6px; border-radius: 999px;
      }
      .card-field.active {
        border-color: transparent; color: #fff;
        background: linear-gradient(135deg, #5b6cff, #ff4f9a);
      }
      .card-field.active ha-icon, .card-field.active b { color: rgba(255,255,255,.9); }
      .card-field.active b { background: rgba(255,255,255,.18); }
      .color-presets { display: flex; gap: 7px; flex-wrap: wrap; margin: 4px 0 8px; }
      .color-dot {
        width: 26px; height: 26px; border-radius: 50%; border: 2px solid rgba(255,255,255,.7);
        background: var(--c); cursor: pointer;
        box-shadow: 0 0 0 1px rgba(0,0,0,.14), 0 4px 10px rgba(0,0,0,.12);
        transition: transform .15s ease;
      }
      .color-dot:hover { transform: scale(1.12); }
      .color-native {
        display: flex; align-items: center; justify-content: space-between;
        gap: 8px; font-size: 11px; color: var(--secondary-text-color, #667085);
      }
      .color-native input[type="color"] {
        width: 42px; height: 30px; border: 0; background: transparent; padding: 0; cursor: pointer;
      }
      .color-model {
        font-size: 9px; letter-spacing: .08em; color: var(--secondary-text-color, #667085);
        border: 1px solid var(--divider-color, #e4e7ec); border-radius: 999px; padding: 2px 7px;
      }
      .scene-presets { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
      .scene-preset {
        border: 1px solid var(--divider-color, #e4e7ec); border-radius: 999px;
        background: transparent; color: inherit; padding: 6px 9px;
        font: inherit; font-size: 10px; cursor: pointer;
      }
      .scene-preset:hover { border-color: var(--primary-color, #5b6cff); color: var(--primary-color, #5b6cff); }
      .features-view { display: flex; flex-direction: column; gap: 16px; }
      .feature-intro { padding: 18px; }
      .feature-intro-head { display: flex; gap: 14px; align-items: flex-start; }
      .feature-intro-head h2 { margin: 0 0 5px; font-size: 20px; }
      .feature-card {
        border: 1px solid var(--divider-color, #e4e7ec); border-radius: 22px;
        background: var(--card-background-color, #fff); padding: 18px;
      }
      .feature-card-head { display: flex; align-items: center; gap: 12px; }
      .feature-card-head h3 { margin: 0 0 3px; font-size: 17px; }
      .feature-card-head .ghost-btn { margin-left: auto; align-self: center; }
      .feature-loading { display: grid; place-items: center; text-align: center; padding: 40px 10px; }
      .feature-error { display: flex; gap: 12px; align-items: flex-start; }
      .feature-error ha-icon { color: #ef4444; --mdc-icon-size: 24px; }
      .feature-summary {
        display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 14px 0;
      }
      .feature-summary > div {
        display: flex; flex-direction: column; gap: 2px; padding: 10px 12px;
        border-radius: 14px; background: var(--secondary-background-color, #f7f8fa);
      }
      .feature-summary b { font-size: 20px; }
      .feature-summary span { font-size: 10px; color: var(--secondary-text-color, #667085); }
      .feature-section-title { margin: 18px 0 9px; font-size: 13px; }
      .feature-added { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 8px; }
      .feature-added-item {
        display: flex; gap: 8px; align-items: flex-start; padding: 9px 10px;
        border-radius: 12px; background: rgba(34,197,94,.07); border: 1px solid rgba(34,197,94,.16);
      }
      .feature-added-item ha-icon { color: #16a34a; --mdc-icon-size: 17px; flex: none; margin-top: 1px; }
      .feature-added-item b { display: block; font-size: 11px; }
      .feature-added-item small { display: block; font-size: 10px; color: var(--secondary-text-color, #667085); margin-top: 2px; }
      .feature-list { display: flex; flex-direction: column; gap: 8px; }
      .feature-item {
        display: flex; align-items: flex-start; gap: 10px; padding: 11px 12px;
        border-radius: 14px; border: 1px solid rgba(245,158,11,.22);
        background: rgba(245,158,11,.06);
      }
      .feature-item-icon {
        width: 34px; height: 34px; border-radius: 10px; flex: none;
        display: grid; place-items: center; color: #b45309;
        background: rgba(245,158,11,.14);
      }
      .feature-item-body { flex: 1; min-width: 0; }
      .feature-item-title { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
      .feature-item-title b { font-size: 12px; }
      .feature-item-title span {
        font-size: 10px; font-weight: 700; color: #b45309;
        background: rgba(245,158,11,.14); border-radius: 999px; padding: 2px 7px;
        max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      .feature-item-body p { margin: 4px 0 0; font-size: 11px; color: var(--secondary-text-color, #667085); line-height: 1.4; }
      .feature-badge {
        flex: none; font-size: 9px; font-weight: 700; color: #b45309;
        border: 1px solid rgba(245,158,11,.28); border-radius: 999px; padding: 4px 7px;
        white-space: nowrap;
      }
      .feature-badge.added {
        color: #15803d; border-color: rgba(34,197,94,.35);
        background: rgba(34,197,94,.10);
      }
      .feature-raw { margin-top: 16px; border-top: 1px solid var(--divider-color, #eef0f4); padding-top: 12px; }
      .feature-raw summary { cursor: pointer; font-size: 12px; font-weight: 600; }
      .feature-raw-grid {
        display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 10px;
      }
      .feature-raw h5 { margin: 0 0 6px; font-size: 11px; }
      .feature-raw pre {
        margin: 0; max-height: 340px; overflow: auto; padding: 10px;
        border-radius: 12px; background: #0f1420; color: #d7ddff;
        font-size: 10px; line-height: 1.45; white-space: pre-wrap; word-break: break-word;
      }
      .test-panel { margin-top: 4px; }
      .test-warning {
        display: flex; gap: 10px; align-items: flex-start; padding: 11px 13px;
        border-radius: 14px; background: rgba(245,158,11,.09);
        border: 1px solid rgba(245,158,11,.24); margin-bottom: 12px;
      }
      .test-warning ha-icon { color: #b45309; --mdc-icon-size: 21px; flex: none; }
      .test-warning b { font-size: 12px; }
      .test-warning p { margin: 3px 0 0; font-size: 11px; line-height: 1.4; color: var(--secondary-text-color, #667085); }
      .test-grid {
        display: grid; grid-template-columns: repeat(auto-fill, minmax(265px, 1fr)); gap: 10px;
      }
      .test-block {
        border: 1px solid var(--divider-color, #e4e7ec); border-radius: 16px;
        background: var(--secondary-background-color, #f8f9fb); padding: 12px;
      }
      .test-block h4 {
        margin: 0 0 10px; display: flex; align-items: center; gap: 6px; font-size: 12px;
      }
      .test-block h4 ha-icon { --mdc-icon-size: 16px; color: var(--primary-color, #5b6cff); }
      .test-status-row {
        display: flex; justify-content: space-between; gap: 8px;
        font-size: 10px; padding: 3px 0; border-bottom: 1px dashed var(--divider-color, #e9ecf2);
      }
      .test-status-row span { color: var(--secondary-text-color, #667085); }
      .test-status-row b { text-align: right; font-size: 10px; max-width: 55%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .test-field {
        display: flex; align-items: center; gap: 7px; margin-top: 7px;
        font-size: 10px; color: var(--secondary-text-color, #667085);
      }
      .test-field > span { flex: none; min-width: 96px; }
      .test-field select, .test-field input {
        flex: 1; min-width: 0; height: 29px; border-radius: 8px;
        border: 1px solid var(--divider-color, #e4e7ec);
        background: var(--card-background-color, #fff); color: inherit;
        padding: 0 7px; font: inherit; font-size: 10px;
      }
      .test-field input[type="number"] { max-width: 96px; }
      .test-switch {
        display: flex; align-items: center; gap: 7px; margin: 7px 0;
        font-size: 10px; color: var(--primary-text-color, #1f2430); cursor: pointer;
      }
      .test-switch span { flex: 1; }
      .test-switch input { width: 34px; height: 18px; accent-color: var(--primary-color, #5b6cff); }
      .test-switch b { font-size: 9px; color: var(--secondary-text-color, #667085); min-width: 22px; text-align: right; }
      .test-switch.warning span { color: #b45309; }
      .test-actions { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 9px; }
      .test-btn {
        border: 1px solid var(--divider-color, #e4e7ec); border-radius: 8px;
        background: var(--card-background-color, #fff); color: inherit;
        padding: 6px 8px; font: inherit; font-size: 10px; cursor: pointer;
      }
      .test-btn:hover { border-color: var(--primary-color, #5b6cff); color: var(--primary-color, #5b6cff); }
      .test-btn:disabled { opacity: .45; cursor: default; }
      .test-next-prev { margin-top: 7px; font-size: 9px; color: var(--secondary-text-color, #667085); }
      .test-hint { margin-top: 7px; font-size: 9px; color: var(--secondary-text-color, #667085); line-height: 1.35; }
      .test-row-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; }
      .quick-filters { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 2px; }
      .filter-pill {
        display: inline-flex; align-items: center; gap: 7px; flex: none;
        border: 1px solid var(--divider-color, #e4e7ec);
        background: var(--card-background-color, #fff);
        color: var(--secondary-text-color, #667085); border-radius: 12px;
        padding: 8px 11px; font: inherit; font-size: 12px; cursor: pointer;
        transition: transform .15s ease, border-color .15s ease, background .15s ease;
      }
      .filter-pill ha-icon { --mdc-icon-size: 17px; }
      .filter-pill b {
        min-width: 20px; height: 20px; padding: 0 6px; border-radius: 999px;
        display: inline-grid; place-items: center; font-size: 10px;
        background: var(--secondary-background-color, #f2f4f7);
      }
      .filter-pill:hover { transform: translateY(-1px); border-color: var(--primary-color, #5b6cff); }
      .filter-pill.active {
        background: linear-gradient(135deg, #5b6cff, #8f43ff 60%, #ff4f9a);
        color: #fff; border-color: transparent;
        box-shadow: 0 8px 18px rgba(91,108,255,.22);
      }
      .filter-pill.active b { background: rgba(255,255,255,.22); color: #fff; }
      .search-count {
        flex: none; min-width: 30px; height: 24px; padding: 0 8px;
        border-radius: 999px; display: inline-grid; place-items: center;
        background: var(--secondary-background-color, #f2f4f7);
        color: var(--secondary-text-color, #667085); font-size: 11px; font-weight: 700;
      }
      .section-title {
        display: flex; align-items: flex-end; justify-content: space-between;
        gap: 12px; margin-bottom: 10px;
      }
      .section-title h3 { margin: 0 0 3px; font-size: 17px; }
      .scenes-strip { margin: 4px 0 18px; }
      .scenes-row { display: flex; gap: 9px; overflow-x: auto; padding-bottom: 4px; }
      .scene-pill {
        display: inline-flex; align-items: center; gap: 9px; flex: none;
        border: 1px solid var(--divider-color, #e4e7ec); border-radius: 999px;
        background: var(--card-background-color, #fff); color: var(--primary-text-color, #1f2430);
        padding: 7px 13px 7px 7px; font: inherit; font-size: 12px; font-weight: 600; cursor: pointer;
        transition: transform .15s ease, box-shadow .15s ease;
      }
      .scene-pill:hover { transform: translateY(-1px); box-shadow: 0 10px 22px rgba(16,24,40,.08); }
      .scene-icon {
        width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center;
        color: #fff; background: linear-gradient(135deg, #5b6cff, #ff4f9a);
      }
      .scene-icon ha-icon { --mdc-icon-size: 15px; }
      .favorites-strip { margin: 4px 0 18px; }
      .favorites-row { display: flex; gap: 10px; overflow-x: auto; padding-bottom: 4px; }
      .favorite-tile {
        position: relative; display: flex; align-items: center; gap: 10px; flex: none;
        min-width: 220px; max-width: 280px; text-align: left;
        border: 1px solid var(--divider-color, #e4e7ec); border-radius: 16px;
        background: var(--card-background-color, #fff); color: inherit; padding: 10px 12px;
        font: inherit; cursor: pointer; overflow: hidden;
      }
      .favorite-tile::after {
        content: ""; position: absolute; inset: auto 0 0; height: 3px;
        background: linear-gradient(90deg, var(--accent, #5b6cff), transparent);
        opacity: .55;
      }
      .favorite-tile:hover { border-color: var(--accent, #5b6cff); }
      .favorite-icon {
        width: 38px; height: 38px; border-radius: 12px; display: grid; place-items: center;
        color: var(--accent, #5b6cff); background: color-mix(in srgb, var(--accent, #5b6cff) 14%, transparent);
        font-size: 20px; flex: none;
      }
      .favorite-meta { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
      .favorite-meta b { font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .favorite-meta small { font-size: 10px; color: var(--secondary-text-color, #667085); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .card-shell { position: relative; border-radius: 20px; height: 100%; }
      .card-rail {
        position: absolute; top: 0; bottom: 0; display: flex; align-items: center;
        gap: 6px; padding: 10px; z-index: 0;
      }
      .card-rail-left { left: 0; flex-direction: row; }
      .card-rail-right { right: 0; }
      .rail-btn {
        width: 58px; height: 100%; max-height: 96px; border: 0; border-radius: 14px;
        display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 5px;
        background: var(--secondary-background-color, #eef1f7); color: var(--secondary-text-color, #667085);
        font: inherit; font-size: 9px; cursor: pointer;
      }
      .rail-btn ha-icon { --mdc-icon-size: 21px; }
      .rail-btn.active, .rail-power.active {
        background: linear-gradient(135deg, #5b6cff, #ff4f9a); color: #fff;
      }
      .card-shell .card {
        z-index: 1; touch-action: pan-y; user-select: none;
        transition: transform .22s ease, box-shadow .15s ease, border-color .15s ease;
      }
      .card.dragging { transition: none; cursor: grabbing; }
      .card-shell.open-left .card { transform: translateX(-122px); }
      .card-shell.open-left .card-rail-right { z-index: 2; }
      .card.is-on { border-color: color-mix(in srgb, var(--primary-color, #5b6cff) 35%, var(--divider-color, #e4e7ec)); }
      .card.favorite { box-shadow: inset 0 0 0 1px rgba(245, 158, 11, .25); }
      .card-head-right { display: flex; align-items: center; gap: 8px; }
      .fav-mark { color: #f59e0b; --mdc-icon-size: 18px; }
      .card-actions-row { display: flex; align-items: center; gap: 6px; }
      .mini-action {
        width: 32px; height: 32px; border-radius: 10px; border: 1px solid var(--divider-color, #e4e7ec);
        background: transparent; color: var(--secondary-text-color, #667085);
        display: grid; place-items: center; cursor: pointer;
      }
      .mini-action:hover { color: var(--primary-color, #5b6cff); border-color: var(--primary-color, #5b6cff); }
      .mini-slider {
        display: flex; align-items: center; gap: 8px; margin-top: 11px;
        padding: 7px 9px; border-radius: 11px; background: var(--secondary-background-color, #f7f8fa);
        color: var(--secondary-text-color, #667085);
      }
      .mini-slider ha-icon { --mdc-icon-size: 16px; flex: none; }
      .mini-slider input { flex: 1; min-width: 0; }
      .mini-slider span { min-width: 36px; text-align: right; font-size: 10px; font-weight: 600; }
      .mini-chip {
        display: inline-flex; align-items: center; gap: 6px; margin-top: 11px;
        padding: 6px 9px; border-radius: 10px; background: var(--secondary-background-color, #f7f8fa);
        color: var(--secondary-text-color, #667085); font-size: 11px; font-weight: 600;
      }
      .mini-chip ha-icon { --mdc-icon-size: 16px; }
      .sheet-backdrop {
        position: fixed; inset: 0; z-index: 40; display: flex; align-items: flex-end;
        justify-content: center; padding: 18px; background: rgba(9, 12, 24, .48);
        backdrop-filter: blur(5px); animation: sheetFade .18s ease both;
      }
      @keyframes sheetFade { from { opacity: 0; } to { opacity: 1; } }
      .quick-sheet {
        width: min(720px, 100%); max-height: 88vh; overflow: auto;
        border-radius: 26px; background: var(--card-background-color, #fff);
        color: var(--primary-text-color, #1f2430); padding: 16px 20px 24px;
        box-shadow: 0 30px 80px rgba(0,0,0,.35); animation: sheetUp .22s ease both;
      }
      @keyframes sheetUp { from { transform: translateY(24px); opacity: .6; } to { transform: translateY(0); opacity: 1; } }
      .sheet-grabber { width: 44px; height: 4px; border-radius: 99px; background: var(--divider-color, #dfe3ea); margin: 0 auto 12px; }
      .sheet-head { display: flex; align-items: center; gap: 14px; }
      .sheet-title { flex: 1; min-width: 0; }
      .sheet-title h2 { margin: 0 0 4px; font-size: 21px; }
      .sheet-close {
        width: 38px; height: 38px; border-radius: 50%; border: 1px solid var(--divider-color, #e4e7ec);
        background: transparent; color: inherit; cursor: pointer; display: grid; place-items: center;
      }
      .sheet-quick-actions { display: flex; gap: 8px; flex-wrap: wrap; margin: 16px 0; }
      .sheet-power, .sheet-action {
        display: inline-flex; align-items: center; gap: 7px; border-radius: 12px;
        padding: 10px 13px; font: inherit; font-size: 12px; font-weight: 600; cursor: pointer;
        border: 1px solid var(--divider-color, #e4e7ec); background: transparent; color: inherit;
      }
      .sheet-power { min-width: 140px; justify-content: center; }
      .sheet-power.on { background: linear-gradient(135deg, #5b6cff, #ff4f9a); color: #fff; border-color: transparent; }
      .sheet-power.ghost { color: var(--secondary-text-color, #667085); }
      .sheet-action.active { color: #b45309; border-color: rgba(245,158,11,.4); background: rgba(245,158,11,.08); }
      .sheet-section { border-top: 1px solid var(--divider-color, #eef0f4); padding-top: 14px; margin-top: 14px; }
      .sheet-section h3 { margin: 0 0 8px; font-size: 13px; }
      .sheet-section .section { border: 0; padding: 0; background: transparent; }
      .speaker-extras { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
      .panel-source {
        display: flex; align-items: center; gap: 5px;
        flex-wrap: wrap; width: 100%;
      }
      .panel-source > button { max-width: 230px; }
      .panel-source > button ha-icon { flex: none; }
      .source-switch {
        display: inline-flex; align-items: center; gap: 3px; padding: 3px;
        border-radius: 11px; border: 1px solid rgba(255,255,255,.14);
        background: rgba(255,255,255,.06);
      }
      .source-switch > span { font-size: 9px; color: rgba(255,255,255,.46); padding: 0 5px; }
      .source-switch button {
        display: inline-flex; align-items: center; gap: 5px; border: 0; border-radius: 8px;
        background: transparent; color: rgba(255,255,255,.66); padding: 5px 8px;
        font: inherit; font-size: 10px; cursor: pointer;
      }
      .source-switch button ha-icon { --mdc-icon-size: 14px; }
      .source-switch button.active {
        background: linear-gradient(135deg, var(--skin-accent, #5b6cff), var(--skin-accent-2, #ff4f9a));
        color: #fff;
      }
      .source-switch.wide { background: rgba(255,255,255,.06); width: 100%; }
      .source-switch.wide button { flex: 1; justify-content: center; padding: 8px; font-size: 11px; }
      .extra-pill {
        display: inline-flex; align-items: center; gap: 6px; border-radius: 10px;
        border: 1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.06);
        color: rgba(255,255,255,.7); padding: 6px 9px; font: inherit; font-size: 10px; cursor: pointer;
      }
      .extra-pill ha-icon { --mdc-icon-size: 15px; }
      .extra-pill.active { color: #fff; border-color: rgba(143,155,255,.7); background: rgba(108,124,255,.22); }
      .auto-mode-btn {
        display: flex; align-items: center; gap: 7px; width: 100%;
        border: 1px solid var(--divider-color, #e4e7ec); border-radius: 10px;
        background: transparent; color: inherit; padding: 7px 9px; font: inherit; font-size: 11px; cursor: pointer;
      }
      .auto-mode-btn b { margin-left: auto; font-size: 10px; opacity: .6; }
      .auto-mode-btn.active { color: #fff; border-color: transparent; background: linear-gradient(135deg, #5b6cff, #ff4f9a); }
      .auto-mode-btn.active b { opacity: .9; }
      .player-kicker, .full-kicker { display: inline-flex; align-items: center; gap: 6px; }
      .player-kicker .beat-dot { width: 6px; height: 6px; }
      .beat-strip {
        display: flex; align-items: center; gap: 8px; color: rgba(255,255,255,.55);
        font-size: 9px; letter-spacing: .08em; text-transform: uppercase;
      }
      .beat-strip b { color: rgba(255,255,255,.82); font-size: 10px; letter-spacing: .02em; }
      .beat-dot {
        width: 8px; height: 8px; border-radius: 50%; flex: none;
        background: var(--skin-accent-2, #ff4f9a);
        box-shadow: 0 0 0 4px rgba(255,79,154,.12), 0 0 14px var(--skin-accent-2, #ff4f9a);
        transition: transform .07s linear, opacity .07s linear;
      }
      .full-skin-row {
        display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
        padding-top: 4px; border-top: 1px solid rgba(255,255,255,.09);
      }
      .full-skin-row > span { font-size: 9px; letter-spacing: .08em; text-transform: uppercase; color: rgba(255,255,255,.48); }
      .full-skin-grid { display: flex; gap: 6px; flex-wrap: wrap; }
      .skin-swatch {
        display: inline-flex; align-items: center; gap: 5px; border: 1px solid rgba(255,255,255,.14);
        border-radius: 999px; background: rgba(255,255,255,.05); color: rgba(255,255,255,.62);
        padding: 4px 8px 4px 4px; font: inherit; font-size: 9px; cursor: pointer;
      }
      .skin-swatch > span {
        width: 15px; height: 15px; border-radius: 50%;
        background: linear-gradient(135deg, #6c7cff, #ff4f9a);
      }
      .skin-swatch.skin-2 > span { background: linear-gradient(135deg, #7c8cff, #4fd1ff); }
      .skin-swatch.skin-3 > span { background: linear-gradient(135deg, #f2b35e, #ff7a59); }
      .skin-swatch.skin-4 > span { background: linear-gradient(135deg, #8be9fd, #c084fc); }
      .skin-swatch.skin-5 > span { background: linear-gradient(135deg, #ff3df2, #39e7ff); }
      .skin-swatch.skin-6 > span { background: linear-gradient(135deg, #111827, #6b7280); }
      .skin-swatch.skin-7 > span { background: linear-gradient(135deg, #37d39a, #6c7cff); }
      .skin-swatch.skin-8 > span { background: linear-gradient(135deg, #d6b36a, #b08b46); }
      .skin-swatch.active { color: #fff; border-color: rgba(143,155,255,.9); background: rgba(108,124,255,.22); }
      .player .viz {
        transform: scale(calc(1 + var(--beat, 0) * .028));
        filter: brightness(calc(1 + var(--beat, 0) * .32));
        transition: transform .06s linear, filter .06s linear;
      }
      .player:not(.playing) .viz { transform: none; filter: none; }
      .viz-bars span { animation-duration: calc(var(--beat-dur, 1.15s) * .5); }
      .viz-wave span { animation-duration: calc(var(--beat-dur, 1.6s) * .8); }
      .viz-orbit i { animation-duration: calc(var(--beat-dur, 3s) * 2.4); }
      .viz-orbit i:nth-child(2) { animation-duration: calc(var(--beat-dur, 3s) * 3.2); }
      .viz-orbit i:nth-child(3) { animation-duration: calc(var(--beat-dur, 3s) * 4.2); }
      .wave-a, .wave-b { animation-duration: calc(var(--beat-dur, 3.2s) * 2.4); }
      .viz-ekg path { animation-duration: calc(var(--beat-dur, 2.6s) * 2); }
      .viz-dots span { animation-duration: calc(var(--beat-dur, 1.1s) * .55); }
      .radial-ring span { animation-duration: calc(var(--beat-dur, 1.15s) * .6); }
      .tunnel-row span { animation-duration: calc(var(--beat-dur, 1.2s) * .65); }
      .viz-rings i { animation-duration: calc(var(--beat-dur, 2.8s) * 2.2); }
      .viz-rings i:nth-child(2) { animation-duration: calc(var(--beat-dur, 2.8s) * 3.4); }
      .viz-rings i:nth-child(3) { animation-duration: calc(var(--beat-dur, 2.8s) * 4.6); }
      .viz-rain span { animation-duration: calc(var(--beat-dur, 1.45s) * 1.1); }
      .viz-blocks span { animation-duration: calc(var(--beat-dur, .9s) * .55); }
      .full-player.beat-accent .beat-dot { box-shadow: 0 0 0 7px rgba(255,79,154,.16), 0 0 20px var(--skin-accent-2, #ff4f9a); }
      @media (max-width: 720px) {
        .quick-sheet { padding: 14px 14px 22px; border-radius: 20px; }
        .favorite-tile { min-width: 190px; }
        .beat-strip { font-size: 8px; }
        .full-skin-row > span { display: none; }
        .full-skin-grid { gap: 4px; }
        .skin-swatch { padding: 3px; }
        .skin-swatch small { display: none; }
      }
      @media (max-width: 720px) {
        .shell { padding: 18px 14px 50px; }
        .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .brand p { display: none; }
        h1 { font-size: 21px; }
        .speaker-toolbar { flex-direction: column; align-items: stretch; }
        .viz-switch { align-self: flex-start; }
        .players { grid-template-columns: 1fr; }
        .player-head { align-items: flex-start; }
        .player-cover { width: 88px; height: 88px; border-radius: 20px; }
        .player-meta h3 { font-size: 19px; }
        .eq-select { max-width: none; width: 100%; }
        .player.full { padding: 18px; }
        .player.full .player-head { flex-direction: column; }
        .player.full .player-cover.big { width: 100%; height: auto; aspect-ratio: 1; }
        .player.full .player-meta h3 { font-size: 22px; }
        .lyrics-prev { font-size: 11px; }
        .lyrics-current { font-size: 19px; }
        .lyrics-next { font-size: 12px; }
        .lyrics-countdown { font-size: 10px; min-width: 28px; }
        .full-content { padding: 16px; }
        .full-main { grid-template-columns: 1fr; gap: 14px; }
        .full-player .player-cover.big { max-width: 380px; margin: 0 auto; }
        .full-title h2 { font-size: 22px; }
        .full-viz { height: 110px; }
        .music-hub { padding: 14px; border-radius: 20px; }
        .music-hub-head { flex-direction: column; align-items: stretch; }
        .music-hub-head select { max-width: none; }
        .music-search-bar { flex-direction: column; }
        .music-content { max-height: 320px; }
        .track-duration { display: none; }
        .playlist-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      }

      /* Music streaming */
      .stream-tab { display: flex; flex-direction: column; gap: 14px; }
      .stream-hero {
        display: flex; align-items: center; gap: 14px;
        padding: 18px 20px; border-radius: 22px;
        background: linear-gradient(135deg, rgba(91,108,255,.14), rgba(255,79,154,.08));
        border: 1px solid rgba(91,108,255,.22);
      }
      .stream-hero-icon {
        width: 46px; height: 46px; border-radius: 15px; flex: none;
        display: grid; place-items: center;
        color: #fff; font-size: 24px;
        background: linear-gradient(135deg, #5b6cff, #ff4f9a);
        box-shadow: 0 10px 24px rgba(91,108,255,.25);
      }
      .stream-hero-copy { flex: 1; min-width: 0; }
      .stream-hero-copy h2 { margin: 0 0 4px; font-size: 20px; }
      .stream-hero-copy p { margin: 0; color: var(--secondary-text-color, #667085); font-size: 12px; line-height: 1.45; }
      .stream-status {
        flex: none; padding: 6px 11px; border-radius: 999px;
        font-size: 11px; font-weight: 700;
        background: rgba(22,163,74,.1); color: #16a34a;
        border: 1px solid rgba(22,163,74,.22);
      }
      .stream-status.active { background: rgba(255,79,154,.1); color: #db2777; border-color: rgba(255,79,154,.25); }
      .stream-grid {
        display: grid; gap: 14px;
        grid-template-columns: minmax(280px, .85fr) minmax(320px, 1.15fr);
        align-items: start;
      }
      .stream-card { display: flex; flex-direction: column; gap: 10px; }
      .stream-card-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
      .stream-card-head h3 { margin: 0; display: flex; align-items: center; gap: 7px; }
      .stream-card-head h3 ha-icon { --mdc-icon-size: 18px; color: #5b6cff; }
      .stream-kicker { font-size: 10px; font-weight: 700; color: var(--secondary-text-color, #667085); text-transform: uppercase; letter-spacing: .06em; }
      .stream-field { display: flex; flex-direction: column; gap: 5px; }
      .stream-field > span { font-size: 10px; text-transform: uppercase; letter-spacing: .08em; color: var(--secondary-text-color, #667085); }
      .stream-field select {
        width: 100%; padding: 10px 12px; border-radius: 12px;
        border: 1px solid var(--divider-color, #e4e7ec);
        background: var(--card-background-color, #fff);
        color: var(--primary-text-color, #1f2430); font: inherit; font-size: 13px;
      }
      .stream-source-meta {
        display: flex; flex-wrap: wrap; align-items: center; gap: 6px;
        min-height: 24px; font-size: 11px; color: var(--secondary-text-color, #667085);
      }
      .stream-state, .stream-volume {
        padding: 3px 7px; border-radius: 999px;
        background: rgba(91,108,255,.09); color: #5b6cff;
        font-size: 10px; font-weight: 700;
      }
      .stream-now { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }
      .stream-param-line {
        display: flex; align-items: center; justify-content: space-between;
        gap: 10px; padding: 9px 0;
        border-top: 1px solid var(--divider-color, #eef0f4);
        font-size: 12px;
      }
      .stream-param-line > span { color: var(--secondary-text-color, #667085); }
      .stream-param-line > b { text-align: right; font-size: 12px; }
      .stream-clickable { cursor: pointer; }
      .stream-clickable:hover > b { color: #5b6cff; }
      .stream-quality {
        padding: 6px 8px; border-radius: 8px;
        border: 1px solid var(--divider-color, #e4e7ec);
        background: var(--card-background-color, #fff);
        color: var(--primary-text-color, #1f2430);
        font: inherit; font-size: 10px;
      }
      .stream-segmented {
        display: inline-flex; padding: 3px; gap: 3px;
        border-radius: 10px; background: rgba(91,108,255,.08);
        border: 1px solid rgba(91,108,255,.16);
      }
      .stream-segmented button {
        border: 0; background: transparent; color: var(--secondary-text-color, #667085);
        font: inherit; font-size: 10px; font-weight: 700;
        padding: 6px 8px; border-radius: 7px; cursor: pointer;
      }
      .stream-segmented button.active {
        background: linear-gradient(135deg, #5b6cff, #ff4f9a); color: #fff;
        box-shadow: 0 4px 10px rgba(91,108,255,.22);
      }
      .stream-template-wrap { display: flex; flex-direction: column; gap: 7px; padding: 9px; border-radius: 12px; background: rgba(91,108,255,.06); }
      .stream-template-wrap.hidden { display: none; }
      .stream-template-wrap input {
        width: 100%; padding: 9px 10px; border-radius: 9px;
        border: 1px solid var(--divider-color, #e4e7ec);
        background: var(--card-background-color, #fff); color: var(--primary-text-color, #1f2430);
        font: 12px/1.4 ui-monospace, SFMono-Regular, Consolas, monospace;
      }
      .stream-template-wrap small { font-size: 10px; color: var(--secondary-text-color, #667085); }
      .stream-presets { display: flex; flex-wrap: wrap; gap: 5px; }
      .stream-presets button {
        border: 1px solid rgba(91,108,255,.2); background: rgba(91,108,255,.08);
        color: #5b6cff; border-radius: 999px; padding: 4px 8px;
        font: inherit; font-size: 10px; font-weight: 700; cursor: pointer;
      }
      .stream-search {
        display: flex; align-items: center; gap: 8px;
        padding: 9px 11px; border-radius: 12px;
        border: 1px solid var(--divider-color, #e4e7ec);
        background: var(--card-background-color, #fff);
      }
      .stream-search ha-icon { --mdc-icon-size: 18px; color: var(--secondary-text-color, #667085); }
      .stream-search input { flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; color: var(--primary-text-color, #1f2430); font: inherit; font-size: 12px; }
      .stream-selected { display: flex; flex-wrap: wrap; gap: 5px; min-height: 24px; }
      .stream-chip {
        display: inline-flex; align-items: center; gap: 4px;
        padding: 4px 8px; border-radius: 999px;
        border: 1px solid rgba(91,108,255,.2);
        background: rgba(91,108,255,.1); color: #5b6cff;
        font: inherit; font-size: 10px; font-weight: 700; cursor: pointer;
      }
      .stream-chip ha-icon { --mdc-icon-size: 12px; }
      .stream-muted { font-size: 11px; color: var(--secondary-text-color, #667085); }
      .stream-target-list {
        display: flex; flex-direction: column; gap: 6px;
        max-height: 360px; overflow: auto; padding-right: 3px;
      }
      .stream-target {
        display: flex; align-items: center; gap: 9px; width: 100%;
        text-align: left; padding: 9px 10px; border-radius: 12px;
        border: 1px solid var(--divider-color, #e4e7ec);
        background: var(--card-background-color, #fff);
        color: var(--primary-text-color, #1f2430); cursor: pointer;
        transition: border-color .15s ease, background .15s ease;
      }
      .stream-target:hover { border-color: rgba(91,108,255,.4); background: rgba(91,108,255,.04); }
      .stream-target.selected { border-color: #5b6cff; background: rgba(91,108,255,.09); }
      .stream-target.disabled { opacity: .5; }
      .stream-device-icon {
        width: 30px; height: 30px; border-radius: 9px; flex: none;
        display: grid; place-items: center; background: rgba(91,108,255,.1); color: #5b6cff;
      }
      .stream-device-icon ha-icon { --mdc-icon-size: 18px; }
      .stream-device-copy { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
      .stream-device-copy b { font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .stream-device-copy small { font-size: 10px; color: var(--secondary-text-color, #667085); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .stream-device-badges { display: flex; gap: 3px; flex: none; }
      .stream-device-badges i {
        font-style: normal; font-size: 8px; font-weight: 800;
        padding: 2px 4px; border-radius: 4px;
        background: rgba(22,163,74,.1); color: #16a34a;
      }
      .stream-device-badges i.off { background: rgba(220,38,38,.08); color: #dc2626; }
      .stream-check { flex: none; color: #5b6cff; display: grid; place-items: center; }
      .stream-check ha-icon { --mdc-icon-size: 18px; }
      .stream-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
      .stream-hint {
        display: flex; align-items: flex-start; gap: 10px;
        padding: 12px 14px; border-radius: 14px;
        background: rgba(91,108,255,.07);
        border: 1px solid rgba(91,108,255,.16);
        color: var(--secondary-text-color, #667085);
      }
      .stream-hint ha-icon { --mdc-icon-size: 20px; color: #5b6cff; flex: none; }
      .stream-hint > div { display: flex; flex-direction: column; gap: 3px; }
      .stream-hint b { color: var(--primary-text-color, #1f2430); font-size: 12px; }
      .stream-hint span { font-size: 11px; line-height: 1.4; }
      .stream-actions .action-btn { min-height: 42px; }
      .stream-session {
        display: flex; flex-direction: column; gap: 7px;
        padding: 11px 12px; border-radius: 14px;
        border: 1px solid var(--divider-color, #e4e7ec);
        background: rgba(91,108,255,.04);
      }
      .stream-session-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
      .stream-session-head > div { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
      .stream-session-head b { font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .stream-session-head small { font-size: 9px; color: var(--secondary-text-color, #667085); font-family: ui-monospace, monospace; }
      .stream-session-targets { display: flex; flex-wrap: wrap; gap: 4px; }
      .stream-session-targets span {
        padding: 3px 7px; border-radius: 999px;
        background: rgba(91,108,255,.08); color: #5b6cff; font-size: 10px; font-weight: 700;
      }
      .stream-session-meta { font-size: 10px; color: var(--secondary-text-color, #667085); }
      .ghost-btn.danger { color: #dc2626; border-color: rgba(220,38,38,.25); }
      .stream-empty { padding: 22px 10px; text-align: center; color: var(--secondary-text-color, #667085); font-size: 12px; }
      .stream-empty.error { color: #dc2626; }
      @media (max-width: 900px) {
        .stream-grid { grid-template-columns: 1fr; }
        .stream-hero { align-items: flex-start; }
        .stream-hero-copy h2 { font-size: 18px; }
      }
    `;
