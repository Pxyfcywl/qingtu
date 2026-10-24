type Session={owner:object;stop:()=>void};
let current:Session|null=null;

export function claimPlayback(owner:object,stop:()=>void){
  const previous=current;
  // Publish the new owner before stopping the old one: its cleanup must not
  // clear the newer request, including requests still resolving a local URL.
  current={owner,stop};
  if(previous&&previous.owner!==owner)previous.stop();
}
export function ownsPlayback(owner:object){return current?.owner===owner;}
export function releasePlayback(owner:object){if(current?.owner===owner)current=null;}
