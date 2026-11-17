import test from 'node:test';
import assert from 'node:assert/strict';
import {deviceTimeContext,contextFor,newChat} from '../src/core.mjs';

test('device time uses the selected local date across UTC midnight',()=>{
 const now=new Date('2026-11-17T23:30:00Z');
 assert.match(deviceTimeContext(now,'Asia/Shanghai'),/2026-11-18 07:30:00/);
 assert.match(deviceTimeContext(now,'America/Los_Angeles'),/2026-11-17 15:30:00/);
 assert.match(deviceTimeContext(now,'Asia/Shanghai'),/GMT\+08:00/);
});

test('device time respects daylight saving and fractional timezone offsets',()=>{
 assert.match(deviceTimeContext(new Date('2026-07-11T12:00:00Z'),'America/New_York'),/2026-07-11 08:00:00.*GMT-04:00/);
 assert.match(deviceTimeContext(new Date('2026-11-17T12:00:00Z'),'America/New_York'),/2026-11-17 07:00:00.*GMT-05:00/);
 assert.match(deviceTimeContext(new Date('2026-11-17T12:00:00Z'),'Asia/Kathmandu'),/2026-11-17 17:45:00.*GMT\+05:45/);
});

test('each context refreshes device time without changing stored story or memory',()=>{
 const c=newChat();c.memory='故事日期：241 日';c.messages=[{role:'user',content:'今天几号？'},{role:'assistant',content:'旧回答：2026年7月11日'}];
 const before=JSON.stringify(c);
 for(const webEnabled of [false,true]){
  const first=contextFor(c,'今天几号？',{webEnabled,now:new Date('2026-11-17T12:00:00Z'),timeZone:'Asia/Shanghai'});
  const next=contextFor(c,'现在呢？',{webEnabled,now:new Date('2026-11-18T12:00:00Z'),timeZone:'Asia/Shanghai'});
  assert.match(first[0].content,/2026-11-17 20:00:00/);
  assert.match(next[0].content,/2026-11-18 20:00:00/);
  assert.match(next[0].content,/故事日期：241 日/);
  assert.match(next[0].content,/故事内的日期遵循剧情设定/);
  assert.equal(next[2].content,c.messages[1].content);
 }
 assert.equal(JSON.stringify(c),before);
});
