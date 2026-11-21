import type { ChatMessage } from '../../types';
import { sha256Hex } from './fileIntegrity';

interface ReceivedFile {
  message?: ChatMessage;
  checksum?: string;
  blob?: Blob;
  verifying?: boolean;
}

export class ReceivedFileIntegrity {
  // Control-channel hashes can precede bulk metadata or its React render.
  private files = new Map<string, ReceivedFile>();

  constructor(
    private onChecksum: (message: ChatMessage, checksum: string) => void,
    private onResult: (message: ChatMessage, expected: string, actual: string, blob: Blob) => void,
  ) {}

  private entry(id: string): ReceivedFile {
    let file = this.files.get(id);
    if (!file) {
      file = {};
      this.files.set(id, file);
      if (this.files.size > 100) this.files.delete(this.files.keys().next().value!);
    }
    return file;
  }

  metadata(message: ChatMessage) {
    const attachment = message.attachment;
    if (!attachment) return;
    const file = this.entry(attachment.id);
    file.message = message;
    file.checksum = attachment.checksum ?? file.checksum;
    if (file.checksum) this.onChecksum(message, file.checksum);
    this.verify(attachment.id, file);
  }

  message(id: string): ChatMessage | undefined {
    return this.files.get(id)?.message;
  }

  checksum(id: string, checksum: string) {
    const file = this.entry(id);
    file.checksum = checksum;
    if (file.message) this.onChecksum(file.message, checksum);
    this.verify(id, file);
  }

  complete(id: string, blob: Blob) {
    const file = this.entry(id);
    file.blob = blob;
    this.verify(id, file);
  }

  private verify(id: string, file: ReceivedFile) {
    if (!file.message || !file.checksum || !file.blob || file.verifying) return;
    const { message, checksum, blob } = file;
    file.verifying = true;
    void sha256Hex(blob).then(actual => {
      if (this.files.get(id) === file && file.blob === blob && file.checksum === checksum) {
        this.onResult(message, checksum, actual, blob);
        file.blob = undefined;
      }
    }).catch(() => { /* leave complete, unverified */ }).finally(() => {
      file.verifying = false;
      if (file.blob && (file.blob !== blob || file.checksum !== checksum)) this.verify(id, file);
    });
  }

  clear() {
    this.files.clear();
  }
}
