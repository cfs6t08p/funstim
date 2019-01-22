importScripts("lame.min.js");

onmessage = e => {
  e = e.data;
  let msg = {};
  
  msg.pctDone = 0;
  msg.status = "primary";

  let fs = JSON.parse(e.funscript);
  
  if(!fs.actions || fs.actions.length == 0) {
    throw "No actions defined in funscript";
  }
  
  if(fs.inverted) {
    e.polarity = -e.polarity;
  }
  
  let actions = fs.actions;
  let length = actions.slice(-1).pop().at;
  
  if(e.fullrange) {
    let min = actions.map(a => a.pos).reduce((a, c) => (a < c ? a : c), 100);
    let max = actions.map(a => a.pos).reduce((a, c) => (a > c ? a : c), 0);
  
    actions = actions.map(a => ({ pos: ((a.pos - min) / (max - min)) * 100, at: a.at }));
  }
  
  let mp3encoder = new lamejs.Mp3Encoder(2, e.sampleRate, e.bitrate);
  let mp3Data = [];
  
  let sampleBlockSize = 1152;
  let left = new Int16Array(sampleBlockSize);
  let right = new Int16Array(sampleBlockSize);
  
  let radsPerSample = e.frequency.map(f => ((f * Math.PI * 2) / e.sampleRate));
  let samplesPerMs = e.sampleRate / 1000;
  let normalSamples = length * samplesPerMs;
  let fadeSamples = e.fade * samplesPerMs;
  let totalSamples = normalSamples + fadeSamples * 2;
  let sample = 0;
  let actionIndex = 0;
  
  actions = actions.map(a => ({at: a.at * samplesPerMs, pos: a.pos / 100}));
  
  let a1 = actions[0];
  let a0 = a1;
  
  let ampFilter = 0;
  
  while(sample < totalSamples) {
    for(let i = 0; i < sampleBlockSize; i++) {
      if(a1.at < sample && actionIndex < actions.length - 1) {
        a0 = a1;
        actionIndex++;
        a1 = actions[actionIndex];
      }
      
      let dist = a1.at - a0.at;
      let dpos = a1.pos - a0.pos;
      
      let alpha = Math.max(0, Math.min(1, (sample - a0.at) / dist)) || 0;
      let pos = Math.max(0, Math.min(1, a0.pos + dpos * alpha));
      
      if(e.doubletime) {
        pos = Math.abs((alpha * 2) - 1);
      }
      
      let amp = 0;
      
      if(e.fadeonpause && fadeSamples && sample >= a0.at && sample <= a1.at) {
        let d0 = sample - a0.at;
        let d1 = a1.at - sample;
        let dmin = d0 < d1 ? d0 : d1;
        
        if(dmin > fadeSamples) {
          dmin = fadeSamples;
        }
        
        amp = (fadeSamples - dmin) / fadeSamples;
      }
      
      if(sample < fadeSamples) {
        amp = Math.min(amp, sample / fadeSamples);
      } else if(sample >= normalSamples) {
        amp = Math.max(0, Math.min(amp, 1 - (sample - normalSamples) / fadeSamples));
      }
      
      let filterLength = (e.sampleRate * e.fade) / 1000;
      
      amp = (amp + ampFilter * (filterLength - 1)) / filterLength;
      
      ampFilter = amp;
      
      let inphase = radsPerSample.reduce((a, c) => a + Math.sin(sample * c), 0) / radsPerSample.length;
      let outphase = radsPerSample.reduce((a, c) => a + e.polarity * Math.sin(sample * c + pos * Math.PI), 0) / radsPerSample.length;
      
      left[i] = inphase * 32767 * amp * e.amplitude;
      right[i] = outphase * 32767 * amp * e.amplitude;
      
      if(e.debug) {
        left[i] = ((amp * 2) - 1) * 32767;
        right[i] = ((pos * 2) - 1) * 32767;
      }
      
      sample++;
    }
    
    let mp3buf = mp3encoder.encodeBuffer(left, right);
    if (mp3buf.length > 0) {
      mp3Data.push(mp3buf);
    }
    
    let newPct = Math.trunc((sample / totalSamples) * 100);
    
    if(newPct > msg.pctDone) {
      msg.pctDone = newPct;
      
      postMessage(msg);
    }
  }
  
  let mp3buf = mp3encoder.flush();
  
  if (mp3buf.length > 0) {
    mp3Data.push(mp3buf);
  }
  
  msg.mp3Data = mp3Data;
  msg.pctDone = 100;
  msg.status = "success";
  
  postMessage(msg);
  
  close();
}
