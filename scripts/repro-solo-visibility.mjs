import assert from 'node:assert/strict';
import { launchBrowser, URL, readLiveCode } from './lib.mjs';

const browser = await launchBrowser();
try {
  const a = await browser.newContext({ serviceWorkers: 'block' });
  const b = await browser.newContext({ serviceWorkers: 'block' });
  a.setDefaultTimeout(15000);
  b.setDefaultTimeout(15000);
  const A = await a.newPage();
  const B = await b.newPage();
  let resumes = 0;
  let disconnects = 0;
  for (const page of [A, B]) page.on('websocket', socket => socket.on('framereceived', frame => {
    if (typeof frame.payload === 'string' && frame.payload.includes('"peer_disconnected"')) disconnects++;
  }));
  A.on('websocket', socket => socket.on('framesent', frame => {
    if (typeof frame.payload === 'string' && frame.payload.includes('"resume_room"')) resumes++;
  }));
  await A.goto(URL);
  await A.getByTestId('home-send').click();
  await A.waitForFunction(() => window.__sharetextDebug.session().roomId);
  const room = await A.evaluate(() => window.__sharetextDebug.session().roomId);
  const droppedAt = Date.now();
  const lost = await A.evaluate(async () => {
    const { getSocket } = await import('/src/lib/socket.ts');
    const socket = getSocket();
    const previous = socket.id;
    socket.disconnect();
    await new Promise(resolve => { socket.once('connect', resolve); socket.connect(); });
    return { changed: socket.id !== previous, recovered: socket.recovered };
  });
  assert.equal(lost.changed, true, 'the creator must have a fresh Socket.IO session');
  assert.equal(lost.recovered, false, 'connection state recovery must not restore the old seat for the test');
  await A.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await B.goto(URL);
  await B.getByTestId('home-receive').click();
  await B.getByTestId('join-code-input').locator('input').first().fill(await readLiveCode(A));
  await A.getByTestId('composer').first().waitFor({ timeout: 15000 }).catch(error => {
    console.log(`SOLO_STATE: freshSocket=${lost.changed}, recovered=${lost.recovered}, visibilityResumes=${resumes}`);
    throw error;
  });
  await B.getByTestId('composer').first().waitFor();
  assert.ok(resumes > 0, 'visibility must re-seat the solo creator');
  assert.equal(await A.evaluate(() => window.__sharetextDebug.session().roomId), room);
  assert.ok(Date.now() - droppedAt < 60000, 'the next device must pair within disconnect grace');
  await A.waitForTimeout(Math.max(0, droppedAt + 62000 - Date.now()));
  console.log(`POST_GRACE: peer_disconnected frames=${disconnects}`);
  for (const [sender, receiver, text] of [[A, B, 'solo recovered A to B'], [B, A, 'solo recovered B to A']]) {
    await sender.getByTestId('composer').first().fill(text);
    await sender.getByRole('button', { name: 'Send', exact: true }).click();
    await receiver.locator('[class~="group/msg"]').filter({ has: receiver.getByText(text, { exact: true }) }).waitFor();
  }
  assert.equal(disconnects, 0, 'a reclaimed seat must not expire after its old socket grace');
  console.log('PASS: solo creator re-seats on visibility; next device pairs within grace; no disconnect after grace and text delivers both ways');
} finally {
  await browser.close();
}
