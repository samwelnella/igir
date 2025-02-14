import DATGameInferrer from '../../src/modules/datGameInferrer.js';
import ROMScanner from '../../src/modules/romScanner.js';
import Options from '../../src/types/options.js';
import ProgressBarFake from '../console/progressBarFake.js';

test.each([
  ['test/fixtures/roms/**/*', {
    '7z': 5,
    headered: 6,
    patchable: 9,
    rar: 5,
    raw: 10,
    roms: 5,
    tar: 5,
    unheadered: 1,
    zip: 6,
  }],
  ['test/fixtures/roms/7z/*', { '7z': 5 }],
  ['test/fixtures/roms/rar/*', { rar: 5 }],
  ['test/fixtures/roms/raw/*', { raw: 10 }],
  ['test/fixtures/roms/tar/*', { tar: 5 }],
  ['test/fixtures/roms/zip/*', { zip: 6 }],
])('should infer DATs: %s', async (inputGlob, expected) => {
  // Given
  const romFiles = await new ROMScanner(new Options({
    input: [inputGlob],
  }), new ProgressBarFake()).scan();

  // When
  const dats = new DATGameInferrer(new ProgressBarFake()).infer(romFiles);

  // Then
  const datNameToGameCount = dats.reduce((map, dat) => ({
    ...map,
    [dat.getName()]: dat.getGames().length,
  }), {});
  expect(datNameToGameCount).toEqual(expected);
});
