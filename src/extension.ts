'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { Global } from './global';
import { SpellProvider } from './features/spellProvider'

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

    console.log('Congratulations, your extension "vsc-spellchecker" is now active!');
    const global = new Global();
    global.activate(context);

    for (let i = 0; i < global.settings.languageIDs.length; i++) {
        vscode.languages.registerCodeActionsProvider(global.settings.languageIDs[i], new SpellProvider(global));
    }
}

// this method is called when your extension is deactivated
export function deactivate() {
}