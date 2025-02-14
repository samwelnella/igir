import FilePoly from '../../polyfill/filePoly.js';
import fsPoly from '../../polyfill/fsPoly.js';
import File from '../files/file.js';
import Patch from './patch.js';

/**
 * WARN(cemmer): because UPS patches use nul-byte termination for records rather than some kind of
 * length identifier, which forces patchers to read both the UPS file and ROM file byte-by-byte,
 * large patches can perform tremendously poorly if they contain many small records.
 * @see https://www.romhacking.net/documents/392/
 * @see https://github.com/btimofeev/UniPatcher/wiki/UPS
 * @see https://www.gamebrew.org/wiki/Upset
 */
export default class UPSPatch extends Patch {
  static readonly SUPPORTED_EXTENSIONS = ['.ups'];

  static readonly FILE_SIGNATURE = Buffer.from('UPS1');

  static async patchFrom(file: File): Promise<UPSPatch> {
    let crcBefore = '';
    let crcAfter = '';
    let targetSize = 0;

    await file.extractToTempFilePoly('r', async (patchFile) => {
      patchFile.seek(UPSPatch.FILE_SIGNATURE.length);
      await Patch.readUpsUint(patchFile); // source size
      targetSize = await Patch.readUpsUint(patchFile); // target size

      patchFile.seek(patchFile.getSize() - 12);
      crcBefore = (await patchFile.readNext(4)).reverse().toString('hex');
      crcAfter = (await patchFile.readNext(4)).reverse().toString('hex');
    });

    if (crcBefore.length !== 8 || crcAfter.length !== 8) {
      throw new Error(`couldn't parse base file CRC for patch: ${file.toString()}`);
    }

    return new UPSPatch(file, crcBefore, crcAfter, targetSize);
  }

  async createPatchedFile(inputRomFile: File, outputRomPath: string): Promise<void> {
    return this.getFile().extractToTempFilePoly('r', async (patchFile) => {
      const header = await patchFile.readNext(4);
      if (!header.equals(UPSPatch.FILE_SIGNATURE)) {
        throw new Error(`UPS patch header is invalid: ${this.getFile().toString()}`);
      }

      const sourceSize = await Patch.readUpsUint(patchFile);
      if (inputRomFile.getSize() !== sourceSize) {
        throw new Error(`UPS patch expected ROM size of ${fsPoly.sizeReadable(sourceSize)}: ${patchFile.getPathLike()}`);
      }
      await Patch.readUpsUint(patchFile); // target size

      return UPSPatch.writeOutputFile(inputRomFile, outputRomPath, patchFile);
    });
  }

  private static async writeOutputFile(
    inputRomFile: File,
    outputRomPath: string,
    patchFile: FilePoly,
  ): Promise<void> {
    return inputRomFile.extractToTempFile(async (tempRomFile) => {
      const sourceFile = await FilePoly.fileFrom(tempRomFile, 'r');

      await fsPoly.copyFile(tempRomFile, outputRomPath);
      const targetFile = await FilePoly.fileFrom(outputRomPath, 'r+');

      try {
        await UPSPatch.applyPatch(patchFile, sourceFile, targetFile);
      } finally {
        await targetFile.close();
        await sourceFile.close();
      }
    });
  }

  private static async applyPatch(
    patchFile: FilePoly,
    sourceFile: FilePoly,
    targetFile: FilePoly,
  ): Promise<void> {
    while (patchFile.getPosition() < patchFile.getSize() - 12) {
      const relativeOffset = await Patch.readUpsUint(patchFile);
      sourceFile.skipNext(relativeOffset);
      targetFile.skipNext(relativeOffset);

      const data = await this.readPatchBlock(patchFile, sourceFile);
      await targetFile.write(data);

      sourceFile.skipNext(1);
      targetFile.skipNext(1);
    }
  }

  private static async readPatchBlock(
    patchFile: FilePoly,
    sourceFile: FilePoly,
  ): Promise<Buffer> {
    const buffer: Buffer[] = [];

    while (patchFile.getPosition() < patchFile.getSize() - 12) {
      const xorByte = (await patchFile.readNext(1)).readUInt8();
      if (!xorByte) { // terminating byte 0x00
        return Buffer.concat(buffer);
      }

      const sourceByte = sourceFile.isEOF()
        ? 0x00
        : (await sourceFile.readNext(1)).readUInt8();
      buffer.push(Buffer.of(sourceByte ^ xorByte));
    }

    throw new Error(`UPS patch failed to read 0x00 block termination: ${patchFile.getPathLike()}`);
  }
}
