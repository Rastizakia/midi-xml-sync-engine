class MusicPlayerEngine {
  constructor() {
    this.state = {
      ppq: 480,
      totalTicks: 0,
      currentTick: 0,
      isPlaying: false,
      startTimeSec: 0,
      startTick: 0,
      metronomeEnabled: false,
      loopEnabled: false,
      loopStartTick: null,
      loopEndTick: null,
      pixelsPerTick: 0.15,
      lastBeat: -1,
      currentPage: 0,
      currentCursorIndex: 0,
      isPlayheadLocked: false

    };

    this.maps = {
      markers: [],
      tempo: [],
      timeSignature: [],
      bars: []
    };

    this.audio = {
      context: null,
      oscillator: null
    };

    this.osmd = null;
    this.cursorTimestamps = [];
    this.engineInterval = null;
    this.animationFrameId = null;

    this.elements = this.getElements();
    this.initOSMD();
    this.bindEvents();
  }

  getElements() {
    return {
      midiInput: document.getElementById('midi-input'),
      xmlInput: document.getElementById('xml-input'),
      playBtn: document.getElementById('play-btn'),
      metronomeBtn: document.getElementById('metronome-btn'),
      loopToggle: document.getElementById('loop-toggle'),
      timelineContainer: document.getElementById('timeline-container'),
      timeline: document.getElementById('timeline'),
      playhead: document.getElementById('playhead'),
      loopArea: document.getElementById('loop-area'),
      loopStart: document.getElementById('loop-start'),
      loopEnd: document.getElementById('loop-end'),
      markerButtons: document.getElementById('marker-buttons'),
      barDisplay: document.getElementById('current-bar-display'),
      tempoDisplay: document.getElementById('current-tempo-display'),
      statusDisplay: document.getElementById('status-message')
    };
  }

  updateStatus(msg, isError = false) {
    this.elements.statusDisplay.innerText = msg;
    this.elements.statusDisplay.style.color = isError ? 'var(--danger-color)' : 'var(--accent-color)';
    console.log(`[Engine]: ${msg}`);
  }

  initOSMD() {
    this.osmd = new opensheetmusicdisplay.OpenSheetMusicDisplay("osmd-container", {
      autoResize: true,
      drawTitle: false,
      drawingParameters: "compacttight",
      pageBackgroundColor: "#ffffff",
      followCursor: true,
    });
    this.updateStatus("OSMD Ready");
  }

  bindEvents() {
    this.elements.midiInput.addEventListener('change', (e) => this.handleMidiUpload(e));
    this.elements.xmlInput.addEventListener('change', (e) => this.handleXmlUpload(e));
    this.elements.playBtn.addEventListener('click', () => this.togglePlayback());
    this.elements.metronomeBtn.addEventListener('click', () => this.toggleMetronome());
    this.elements.loopToggle.addEventListener('click', () => this.toggleLoop());

    this.elements.timelineContainer.addEventListener('contextmenu', (e) => e.preventDefault());
    this.elements.timelineContainer.addEventListener('mousedown', (e) => this.handleTimelineClick(e));

    document.addEventListener('keydown', (e) => this.handleKeyDown(e));
    window.addEventListener('resize', () => this.handleResize());
  }

  initAudio() {
    if (!this.audio.context) {
      this.audio.context = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this.audio.context.state === 'suspended') {
      this.audio.context.resume();
    }
  }

  playClick(isStrong) {
    if (!this.state.metronomeEnabled) return;
    this.initAudio();

    const osc = this.audio.context.createOscillator();
    const gain = this.audio.context.createGain();

    osc.frequency.value = isStrong ? 1200 : 800;
    gain.gain.value = 0.15;

    osc.connect(gain);
    gain.connect(this.audio.context.destination);

    osc.start();
    osc.stop(this.audio.context.currentTime + 0.03);
  }

  async handleMidiUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const buffer = await file.arrayBuffer();
    const data = new Uint8Array(buffer);

    try {
      this.parseMidi(data);
      this.buildBarMap();
      this.autoScaleTimeline();
      this.resetPlaybackState();
      this.renderTimeline();
      this.elements.playBtn.disabled = false;
      this.updateStatus(`MIDI Loaded: ${file.name}`);
    } catch (err) {
      console.error("MIDI Parser Error:", err);
      this.updateStatus("Error reading MIDI file.", true);
    }
  }

  parseMidi(data) {
    this.maps.tempo = [];
    this.maps.timeSignature = [];
    this.maps.markers = [];
    this.state.totalTicks = 0;

    this.state.ppq = (data[12] << 8) | data[13];
    let offset = 14;

    while (offset < data.length) {
      const type = String.fromCharCode(...data.slice(offset, offset + 4));
      const size = (data[offset + 4] << 24) | (data[offset + 5] << 16) | (data[offset + 6] << 8) | data[offset + 7];

      if (type === "MTrk") {
        this.parseTrack(data, offset + 8, offset + 8 + size);
      }
      offset += 8 + size;
    }

    if (this.maps.tempo.length === 0) this.maps.tempo.push({ tick: 0, bpm: 120 });
    if (this.maps.timeSignature.length === 0) this.maps.timeSignature.push({ tick: 0, n: 4, d: 4 });

    this.updateTempoDisplay(this.maps.tempo[0].bpm);
  }
parseTrack(data, start, end) {
    let p = start;
    let tick = 0;
    let lastStatus = 0;

    while (p < end) {
      let delta = 0;
      while (true) {
        const b = data[p++];
        delta = (delta << 7) | (b & 0x7F);
        if (!(b & 0x80)) break;
      }

      tick += delta;
      let status = data[p++];

      if (status < 0x80) {
        p--;
        status = lastStatus;
      } else {
        lastStatus = status;
      }

      if (status === 0xFF) {
        const meta = data[p++];
        const len = data[p++];

        if ([0x01, 0x03, 0x05, 0x06].includes(meta)) {
          let text = "";
          for (let i = 0; i < len; i++) {
            if (data[p + i] >= 32 && data[p + i] <= 126) text += String.fromCharCode(data[p + i]);
          }
          text = text.trim();

          if (text) {
            const lower = text.toLowerCase();

            const isSongSection = /verse|chorus|intro|bridge|outro|solo|pre-chorus|interlude/i.test(lower);
            
            if (isSongSection) {
              this.maps.markers.push({ tick, text });
            } 
            else {
              const isTooLong = text.length > 35;
              const isSongTitle = text.includes(" - ");
              const isRawInstrument = /^(bass|guitar|drums?|vocals?|keyboard|piano|synth|strings?)( guitar)?$/i.test(lower);
              const isMetadata = /copyright|score by|author|tempo=|bpm/i.test(lower);
              const isTabInstruction = /slide|bend|mute/i.test(lower) || /[/\\|]/.test(text);

              if (!isTooLong && !isSongTitle && !isRawInstrument && !isMetadata && !isTabInstruction) {
                this.maps.markers.push({ tick, text });
              }
            }
          }
        }

        if (meta === 0x51) {
          const mpqn = (data[p] << 16) | (data[p + 1] << 8) | data[p + 2];
          this.maps.tempo.push({ tick, bpm: 60000000 / mpqn });
        }

        if (meta === 0x58) {
          this.maps.timeSignature.push({
            tick,
            n: data[p],
            d: Math.pow(2, data[p + 1])
          });
        }

        p += len;
      } else {
        if ((status & 0xF0) !== 0xC0 && (status & 0xF0) !== 0xD0) p++;
        p++;
      }
    }

    if (tick > this.state.totalTicks) this.state.totalTicks = tick;
  }

  buildBarMap() {
    this.maps.bars = [];
    let tick = 0;
    let barNum = 1;
    let sigIdx = 0;

    let { n, d } = this.maps.timeSignature[0];

    while (tick < this.state.totalTicks) {
      if (sigIdx < this.maps.timeSignature.length && tick >= this.maps.timeSignature[sigIdx].tick) {
        n = this.maps.timeSignature[sigIdx].n;
        d = this.maps.timeSignature[sigIdx].d;
        sigIdx++;
      }

      const ticksPerBar = (this.state.ppq * 4 / d) * n;

      this.maps.bars.push({
        bar: barNum,
        tickStart: tick,
        tickEnd: tick + ticksPerBar,
        n, d
      });

      tick += ticksPerBar;
      barNum++;
    }
  }

  getTimeSec() { return performance.now() / 1000; }

  secondsToTick(sec) {
    let time = 0;
    for (let i = 0; i < this.maps.tempo.length; i++) {
      const t = this.maps.tempo[i];
      const next = this.maps.tempo[i + 1];
      const ticksPerSec = (t.bpm * this.state.ppq) / 60;

      if (!next) return t.tick + (sec - time) * ticksPerSec;

      const segmentSec = (next.tick - t.tick) / ticksPerSec;
      if (sec < time + segmentSec) return t.tick + (sec - time) * ticksPerSec;
      
      time += segmentSec;
    }
    return 0;
  }

  tickToPixel(tick) { return tick * this.state.pixelsPerTick; }
  pixelToTick(px) { return px / this.state.pixelsPerTick; }

  tickToBar(tick) {
    for (const bar of this.maps.bars) {
      if (tick >= bar.tickStart && tick < bar.tickEnd) return bar;
    }
    return this.maps.bars[this.maps.bars.length - 1];
  }

  autoScaleTimeline() {
    const containerWidth = this.elements.timelineContainer.offsetWidth;
    const barsToFit = Math.min(5, this.maps.bars.length);
    const viewTicks = this.maps.bars[barsToFit] ? this.maps.bars[barsToFit].tickStart : this.state.totalTicks;
    this.state.pixelsPerTick = containerWidth / viewTicks;
  }

  renderTimeline() {
    const { timeline } = this.elements;
    timeline.innerHTML = "";
    timeline.style.width = this.tickToPixel(this.state.totalTicks) + "px";

    this.maps.bars.forEach(bar => {
      const barDiv = document.createElement("div");
      barDiv.className = "bar";
      barDiv.style.left = this.tickToPixel(bar.tickStart) + "px";
      barDiv.style.width = this.tickToPixel(bar.tickEnd - bar.tickStart) + "px";
      barDiv.innerText = `${bar.bar} [${bar.n}/${bar.d}]`;
      timeline.appendChild(barDiv);

      const ticksPerBeat = (this.state.ppq * 4) / bar.d;
      for (let i = 0; i < bar.n; i++) {
        const beatLine = document.createElement("div");
        beatLine.className = `beat-line ${i === 0 ? "beat-strong" : ""}`;
        beatLine.style.left = this.tickToPixel(bar.tickStart + i * ticksPerBeat) + "px";
        timeline.appendChild(beatLine);
      }
    });

    this.renderMarkers();
    this.renderMarkerNavigation();
    this.updateLoopVisual();
  }

  renderMarkers() {
    this.maps.markers.forEach(m => {
      const markerDiv = document.createElement("div");
      markerDiv.style.cssText = `
        position: absolute;
        left: ${this.tickToPixel(m.tick)}px;
        top: 0;
        height: 100%;
        border-left: 2px dashed var(--accent-color);
        z-index: 10;
        pointer-events: none;
      `;

      const label = document.createElement("span");
      label.style.cssText = `
        background: var(--accent-color);
        color: #000;
        font-size: 9px;
        font-weight: bold;
        padding: 2px 5px;
        border-radius: 0 0 4px 0;
        text-transform: uppercase;
      `;
      label.innerText = m.text;

      markerDiv.appendChild(label);
      this.elements.timeline.appendChild(markerDiv);
    });
  }

  renderMarkerNavigation() {
    const { markerButtons } = this.elements;
    markerButtons.innerHTML = "";

    const validMarkers = this.maps.markers
      .filter(m => m.text.toLowerCase() !== "markeri")
      .sort((a, b) => a.tick - b.tick);

    validMarkers.forEach(m => {
      const btn = document.createElement("button");
      btn.className = "section-btn";
      btn.innerText = m.text;
      btn.onclick = () => this.jumpToTick(m.tick);
      markerButtons.appendChild(btn);
    });
  }

  updateLoopVisual() {
    const { loopStart, loopEnd, loopArea } = this.elements;
    const { loopStartTick, loopEndTick, loopEnabled } = this.state;

    if (loopStartTick !== null) {
      loopStart.style.display = "block";
      loopStart.style.left = this.tickToPixel(loopStartTick) + "px";
    }

    if (loopEndTick !== null) {
      loopEnd.style.display = "block";
      loopEnd.style.left = this.tickToPixel(loopEndTick) + "px";
    }

    if (loopEnabled && loopStartTick !== null && loopEndTick !== null && loopEndTick > loopStartTick) {
      const startPx = this.tickToPixel(loopStartTick);
      const endPx = this.tickToPixel(loopEndTick);
      loopArea.style.display = "block";
      loopArea.style.left = startPx + "px";
      loopArea.style.width = (endPx - startPx) + "px";
    } else {
      loopArea.style.display = "none";
    }
  }

  togglePlayback() {
    this.initAudio();
    if (this.state.isPlaying) this.stop();
    else this.play();
  }

  play() {
    this.state.isPlaying = true;
    this.state.startTimeSec = this.getTimeSec();
    this.state.startTick = this.state.currentTick;
    this.state.lastBeat = -1;

    this.elements.playBtn.innerText = "Stop";
    this.elements.playBtn.classList.add('active');

    if (this.engineInterval) clearInterval(this.engineInterval);
    this.engineInterval = setInterval(() => this.updateLogic(), 20);

    this.startAnimation();
  }

  stop() {
    this.state.isPlaying = false;
    this.elements.playBtn.innerText = "Play";
    this.elements.playBtn.classList.remove('active');

    if (this.engineInterval) clearInterval(this.engineInterval);
    if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
  }

updateLogic() {
    if (!this.state.isPlaying) return;

    const elapsed = this.getTimeSec() - this.state.startTimeSec;
    this.state.currentTick = this.state.startTick + this.secondsToTick(elapsed);
    if (
      this.state.loopEnabled &&
      this.state.loopStartTick !== null && 
      this.state.loopEndTick !== null &&
      this.state.currentTick >= this.state.loopEndTick
    ) {
      this.jumpToTick(this.state.loopStartTick, true);
    }

    this.processMetronome();
}

  processMetronome() {
    if (!this.state.metronomeEnabled) return;

    const bar = this.tickToBar(this.state.currentTick);
    const ticksPerBeat = (this.state.ppq * 4) / bar.d;
    const beat = Math.floor((this.state.currentTick - bar.tickStart) / ticksPerBeat);

    if (beat !== this.state.lastBeat) {
      this.state.lastBeat = beat;
      this.playClick(beat === 0);
    }
  }

  startAnimation() {
    const animate = () => {
      if (!this.state.isPlaying) return;
      this.updateVisuals();
      this.animationFrameId = requestAnimationFrame(animate);
    };
    this.animationFrameId = requestAnimationFrame(animate);
  }

updateVisuals() {
    const { playhead, timelineContainer, barDisplay } = this.elements;

    const currentBar = this.tickToBar(this.state.currentTick);
    if (currentBar) {
        barDisplay.innerText = `Bar: ${currentBar.bar}`;
    }


    const lockPointPx = timelineContainer.offsetWidth / 2;
    const absolutePlayheadPx = this.tickToPixel(this.state.currentTick);

    if (absolutePlayheadPx < lockPointPx) {
        timelineContainer.scrollLeft = 0;
        
        playhead.style.left = absolutePlayheadPx + 'px';
    } else {
        const scrollAmount = absolutePlayheadPx - lockPointPx;
        timelineContainer.scrollLeft = scrollAmount;
        
        playhead.style.left = (lockPointPx + scrollAmount) + 'px';
    }
    
    this.syncOSMD();
}

syncOSMD() {
    if (!this.osmd || !this.osmd.cursor || !this.cursorTimestamps.length) return;

    const ticksPerWholeNote = this.state.ppq * 4;
    const targetTimestamp = this.state.currentTick / ticksPerWholeNote;
    const tolerance = 0.002;

    let lo = 0, hi = this.cursorTimestamps.length - 1, targetIdx = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (this.cursorTimestamps[mid] <= targetTimestamp + tolerance) {
        targetIdx = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    if (this.state.currentCursorIndex > targetIdx) {
      this.osmd.cursor.reset();
      this.state.currentCursorIndex = 0;
    }

    const distanceToCatchUp = targetIdx - this.state.currentCursorIndex;
    
    if (distanceToCatchUp > 0) {
      if (distanceToCatchUp > 2) this.osmd.cursor.hide();
      
      while (this.state.currentCursorIndex < targetIdx && !this.osmd.cursor.Iterator.EndReached) {
        this.osmd.cursor.next();
        this.state.currentCursorIndex++;
      }
      
      this.osmd.cursor.show();
    }
  }

  handleTimelineClick(e) {
    if (!e.ctrlKey) return;
    
    const rect = this.elements.timelineContainer.getBoundingClientRect();
    const clickX = e.clientX - rect.left + this.elements.timelineContainer.scrollLeft;
    const clickedTick = this.pixelToTick(clickX);
    const bar = this.tickToBar(clickedTick);
    
    if (!bar) return;

    if (e.button === 0) this.state.loopStartTick = bar.tickStart;
    if (e.button === 2) this.state.loopEndTick = bar.tickEnd;

    this.updateLoopVisual();
  }

  jumpToTick(tick, keepPlaying = false) {
    const wasPlaying = this.state.isPlaying;
    if (!keepPlaying) this.stop();

    this.state.currentTick = tick;
    this.state.startTick = tick;
    this.state.startTimeSec = this.getTimeSec();
    this.state.lastBeat = -1;

    this.elements.playhead.style.left = this.tickToPixel(tick) + "px";
    
    if (this.osmd && this.osmd.cursor) {
      this.osmd.cursor.reset();
      this.state.currentCursorIndex = 0;
    }

    if (wasPlaying && !keepPlaying) this.play();
    this.updateVisuals();
  }

  resetPlaybackState() {
    this.state.currentTick = 0;
    this.state.currentPage = 0;
    this.state.loopStartTick = null;
    this.state.loopEndTick = null;
    this.state.loopEnabled = false;
    this.state.isPlayheadLocked = false;
    this.elements.playhead.style.left = "0px";
  }

  handleXmlUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        await this.osmd.load(ev.target.result);
        this.osmd.render();

        this.cursorTimestamps = [];
        this.osmd.cursor.reset();
        this.osmd.cursor.hide();

        while (!this.osmd.cursor.Iterator.EndReached) {
          this.cursorTimestamps.push(this.osmd.cursor.Iterator.currentTimeStamp.RealValue);
          this.osmd.cursor.next();
        }

        this.osmd.cursor.reset();
        this.osmd.cursor.show();
        this.osmd.cursor.cursorElement.id = "red-cursor";
        this.state.currentCursorIndex = 0;

        this.updateStatus(`MusicXML Loaded: ${file.name}`);
      } catch (err) {
        console.error("OSMD Error:", err);
        this.updateStatus("Error parsing MusicXML.", true);
      }
    };
    reader.readAsText(file);
  }

  toggleMetronome() {
    this.state.metronomeEnabled = !this.state.metronomeEnabled;
    this.elements.metronomeBtn.innerText = `Metronome: ${this.state.metronomeEnabled ? "ON" : "OFF"}`;
    this.elements.metronomeBtn.classList.toggle('active', this.state.metronomeEnabled);
  }

  toggleLoop() {
    this.state.loopEnabled = !this.state.loopEnabled;
    this.elements.loopToggle.innerText = `Loop: ${this.state.loopEnabled ? "ON" : "OFF"}`;
    this.elements.loopToggle.classList.toggle('active', this.state.loopEnabled);
    this.updateLoopVisual();
  }

  updateTempoDisplay(bpm) {
    this.elements.tempoDisplay.innerText = `Tempo: ${Math.round(bpm)} BPM`;
  }

handleKeyDown(e) {
    if (!this.lastSpaceTime) {
      this.lastSpaceTime = 0;
    }

    switch(e.code) {
      case "Space":
        e.preventDefault();
        const now = performance.now();
        if (now - this.lastSpaceTime < 300) {
          this.stop();
          this.jumpToTick(0);
        } else {
          this.togglePlayback();
        }
        this.lastSpaceTime = now;
        break;

      case "KeyL":
        this.toggleLoop();
        break;

      case "KeyM":
        this.toggleMetronome();
        break;

      case "Digit1":
        if (this.state.loopStartTick !== null) this.jumpToTick(this.state.loopStartTick);
        break;

      case "Digit2":
        if (this.state.loopEndTick !== null) this.jumpToTick(this.state.loopEndTick);
        break;
      
      case "NumpadAdd":
      case "NumpadSubtract":
        e.preventDefault();
        if (!this.maps.bars.length) return;

        const bar = this.tickToBar(this.state.currentTick);
        if (!bar) return;

        const ticksPerBeat = (this.state.ppq * 4) / bar.d;
        const direction = (e.code === "NumpadAdd") ? 1 : -1;
        let newTick = this.state.currentTick + (ticksPerBeat * direction);

        newTick = Math.max(0, Math.min(newTick, this.state.totalTicks));

        this.jumpToTick(newTick);
        break;
    }
}

  handleResize() {
    if (this.maps.bars.length) {
      this.autoScaleTimeline();
      this.renderTimeline();
    }
  }
}

window.addEventListener("DOMContentLoaded", () => {
  window.app = new MusicPlayerEngine();
});