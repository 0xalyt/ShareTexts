import type { ChatMessage } from '../types';

/** A visual run, not a new transfer: every file retains its retry and save. */
export function roomMessageGroups(messages: ChatMessage[], multiDevice: boolean) {
  const groups: Array<Array<{ msg: ChatMessage; idx: number }>> = [];
  messages.forEach((msg, idx) => {
    const group = groups[groups.length - 1];
    const previous = group?.[group.length - 1].msg;
    const together = !multiDevice && msg.attachment && previous?.attachment
      && msg.sender === previous.sender && !msg.attachment.recipients && !previous.attachment.recipients
      && msg.timestamp - previous.timestamp < 60_000;
    if (together) group.push({ msg, idx });
    else groups.push([{ msg, idx }]);
  });
  return groups;
}
