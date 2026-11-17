// Local microphone capture; no network or storage access.
class Capture extends AudioWorkletProcessor {
 constructor(options){super();this.maximum=options.processorOptions.maximum;this.total=0;this.parts=[];this.size=0;this.active=true;this.port.onmessage=e=>{if(e.data==='stop'){this.flush();this.active=false;this.port.postMessage({done:true});}};}
 flush(){if(!this.size)return;const out=new Float32Array(this.size);let i=0;for(const p of this.parts){out.set(p,i);i+=p.length;}this.port.postMessage({samples:out},[out.buffer]);this.parts=[];this.size=0;}
 process(inputs){const channel=inputs[0]?.[0];if(this.active&&channel){const part=channel.slice(0,Math.max(0,this.maximum-this.total));this.parts.push(part);this.size+=part.length;this.total+=part.length;if(this.size>=4096)this.flush();if(this.total>=this.maximum){this.flush();this.active=false;this.port.postMessage({limit:true,done:true});}}return this.active;}
}
registerProcessor('afterword-capture',Capture);
