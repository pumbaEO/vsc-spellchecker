'use strict';

import * as vscode from 'vscode';
import * as fs from 'fs';
import { HunSpeller } from "./callHunspell"
import AbstractProvider from "./abstractProvider";
import { Global } from "../global";

let DEBUG: boolean = true;


export interface SpellProblem {
    error: string;
    preContext: string;
    startLine: number;
    startChar: number;
    endLine: number;
    endChar: number;
    type: string;
    message: string;
    suggestions: string[];
}

let problems: SpellProblem[] = [];

export class SpellProvider extends AbstractProvider implements vscode.CodeActionProvider {

    public activate(context: vscode.ExtensionContext) {
        
    }

    public provideCodeActions(document: vscode.TextDocument, range: vscode.Range, context: vscode.CodeActionContext, token: vscode.CancellationToken): vscode.Command[] {

        if (context.diagnostics.length < 1) {
            return;
        }
        let diagnostic: vscode.Diagnostic = context.diagnostics[0];

        let match: string[] = diagnostic.message.match(/\[([a-zа-яёієїґ0-9\ ]+)\]\ \-/i);
        let error: string = '';

        // should always be true
        if (match.length >= 2)
            error = match[1];

        if (error.length == 0)
            return undefined;
        
        let startTime = new Date().getTime();
        // Get suggestions from suggestion string
        match = diagnostic.message.match(/\[([a-zа-яёієїґ0-9,\ ]+)\]$/i);
        let suggestionstring: string = '';

        let commands: vscode.Command[] = [];

        let suggestions: string[] = new Array();
        // Add each suggestion
        if (match && match.length >= 2) {
            suggestionstring = match[1];

            suggestions = suggestionstring.split(/\,\ /g);
        }
        /*if (suggestions.length < 1){
            commands.push({
                title: 'Found suggestion ...',
                command: Global.foundOnSuggestionCmdId,
                arguments: [document, error]
            })

        }*/
        // Add suggestions to command list
        suggestions.forEach(function (suggestion) {
            commands.push({
                title: 'Replace with \'' + suggestion + '\'',
                command: Global.fixOnSuggestionCmdId,
                arguments: [document, diagnostic, error, suggestion]
            });
        });
        // Add ignore command
        commands.push({
            title: 'Add \'' + error + '\' to ignore list',
            command: Global.addToDictionaryCmdId,
            arguments: [document, error]
        });
        let currTime = new Date().getTime();
        let seconds: number = Math.floor( ( currTime - startTime ) / 1000 );
        //console.log("loaded " + " time:"+seconds);

        return commands;
    }


}
