'use strict';

import { workspace, Uri } from 'vscode';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as downloadManager from './downloadManager';

const pathExists = require('path-exists');
const expandHomeDir = require('expand-home-dir');
const isWindows = process.platform.indexOf('win') === 0;

interface RequirementsData {
    dictionaries: string;
}

/**
 * Resolves the requirements needed to run the extension. 
 * Returns a promise that will resolve to a RequirementsData if 
 * all requirements are resolved, it will reject with ErrorData if 
 * if any of the requirements fails to resolve.
 *  
 */
export async function resolveRequirements(): Promise<RequirementsData> {
    //let java_home = await checkJavaRuntime();
    //await checkJavaVersion(java_home);
    await checkDictonariesInstalled();
    return Promise.resolve({ 'dictionaries': readDictionaryConfig() });
}

export function readDictionaryConfig() : string {
    const config = workspace.getConfiguration();
    let dictionariesRootPath = config.get<string>('vsc-spellchecker.dictionariesRootPath',null); 
    if (dictionariesRootPath.length === 0){
        dictionariesRootPath = path.resolve(__dirname, '../../dictionaries');
    }
    return dictionariesRootPath;
}

export function readUrlConfig(): string {
    const config = workspace.getConfiguration();
    return config.get<string>('vsc-spellchecker.dictionariesUrl',null);

}

function checkDictonariesInstalled(): Promise<any> {
    let dictionariesRootPath = readDictionaryConfig();
    try {
        let isDirectory = fs.lstatSync(dictionariesRootPath);
        if (isDirectory) {
            return Promise.resolve(true);
        }
    }
    catch (err) {
       // Directory does not exist 
    }
    return downloadManager.downloadAndInstallServer(path.resolve(dictionariesRootPath, ".."), readUrlConfig());
}
