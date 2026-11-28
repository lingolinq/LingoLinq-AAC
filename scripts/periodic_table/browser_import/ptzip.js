function ptZip(files){var enc=new TextEncoder(),T=[],n,c,k;for(n=0;n<256;n++){c=n;for(k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;T[n]=c>>>0;}
function crc(u){var c=0xFFFFFFFF;for(var i=0;i<u.length;i++)c=T[(c^u[i])&255]^(c>>>8);return(c^0xFFFFFFFF)>>>0;}
var parts=[],cen=[],off=0,names=Object.keys(files).sort(function(a,b){return a=="manifest.json"?-1:b=="manifest.json"?1:a<b?-1:1;});
function hdr(sig,extra,nm,d,cr){var h=new DataView(new ArrayBuffer(extra?46:30)),p=0;h.setUint32(p,sig,true);p+=4;if(extra){h.setUint16(p,20,true);p+=2;}
h.setUint16(p,20,true);p+=2;h.setUint16(p,0x0800,true);p+=2;h.setUint16(p,0,true);p+=2;h.setUint16(p,0,true);p+=2;h.setUint16(p,0x5C21,true);p+=2;
h.setUint32(p,cr,true);p+=4;h.setUint32(p,d.length,true);p+=4;h.setUint32(p,d.length,true);p+=4;h.setUint16(p,nm.length,true);p+=2;h.setUint16(p,0,true);p+=2;
if(extra){h.setUint16(p,0,true);p+=2;h.setUint16(p,0,true);p+=2;h.setUint16(p,0,true);p+=2;h.setUint32(p,0,true);p+=4;h.setUint32(p,extra.off,true);}
return new Uint8Array(h.buffer);}
names.forEach(function(name){var nm=enc.encode(name),d=enc.encode(files[name]),cr=crc(d);parts.push(hdr(0x04034b50,null,nm,d,cr),nm,d);cen.push(hdr(0x02014b50,{off:off},nm,d,cr),nm);off+=30+nm.length+d.length;});
var cs=0;cen.forEach(function(x){cs+=x.length;});var e=new DataView(new ArrayBuffer(22));e.setUint32(0,0x06054b50,true);e.setUint16(8,names.length,true);e.setUint16(10,names.length,true);e.setUint32(12,cs,true);e.setUint32(16,off,true);
var all=parts.concat(cen,[new Uint8Array(e.buffer)]),len=0;all.forEach(function(x){len+=x.length;});var out=new Uint8Array(len),q=0;all.forEach(function(x){out.set(x,q);q+=x.length;});return out;}
if(typeof module!=="undefined")module.exports=ptZip;
