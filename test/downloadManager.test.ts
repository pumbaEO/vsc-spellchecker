import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import { Global } from '../src/global'
import * as  downloadManager from '../src/features/downloadManager';
import * as requirements from '../src/features/requirements'


suite('Spell Extension downloadManager tests', () => {

    // Defines a Mocha unit test
    test('Download server', function(done ) {
        this.timeout(5*60*1000);
        console.log(requirements.readUrlConfig());
        /*return downloadManager.downloadAndInstallServer(requirements.readDictionaryConfig(), requirements.readUrlConfig())
            .then(() => {
                let pluginsPath = path.resolve(requirements.readDictionaryConfig(), 'dictionaries/uk_UA');
                try {
                    console.log(pluginsPath);
                    let isDirectory = fs.lstatSync(pluginsPath);
                    assert.ok(isDirectory,'plugins folder is not found');
                }
                catch (err) {
                    assert.ifError(err);
                }
                done();
            });*/
        done();
    });
});