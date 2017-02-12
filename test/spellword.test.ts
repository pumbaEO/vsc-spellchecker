import * as vscode from "vscode";
import { fixturePath, mAsync, newTextDocument } from "./helpers";
import { Global } from "../src/global";
import * as spellchecker from '../src/extension';
import * as hunspell from '../src/features/callHunspell'
import * as path from "path";
import * as assert from 'assert';

let spell: hunspell.HunSpeller;



suite('spell word ', () => {

    /*before(mAsync(async (done) => {
        spell = new hunspell.HunSpeller();
        spell.setDictonaryPath(path.resolve(__dirname, "..","dictionaries"));
    }));*/

    /*beforeEach(mAsync(async (done) => {
        spell = new hunspell.HunSpeller();
        spell.setDictonaryPath(path.resolve(__dirname, "..","dictionaries"));
    }));*/

    setup(() => {
        spell = new hunspell.HunSpeller();
        spell.setDictonaryPath(path.resolve(__dirname, "..", "..", "dictionaries"));
    });

	test('should check word', mAsync(async (done) => {
        let result = await spell.checkWord("swimming", ["en_US"]);
        assert.ok(result["check"], "простое слово должно проверятся");
	}));

    test('should error word', mAsync(async (done) => {
        
        let result = await spell.checkWord("swiming", ["en_US"]);
        assert.ok(!result["check"], "");
        //done();
	}));

    test('should suggests word', mAsync(async (done) => {
        
        let result = await spell.getSuggestions("swiming", ["en_US"]);
        assert.ok(result, "");
        //done();
	}));
});