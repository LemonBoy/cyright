// Compiler command
import { exec } from 'child_process';
import { combinePaths, getDirectoryPath } from 'pyright-internal/common/pathUtils';
import {
    OutputChannel,
    ProgressLocation,
    Uri,
    window,
} from 'vscode';

class ProgressReporter {
    outputChannel: OutputChannel;
    private _filename: string;

    constructor(filename: string, outputChannel: OutputChannel) {
        this.outputChannel = outputChannel;
        this._filename = filename;
    }

    starting() { return `Compiling file: ${this._filename}`; }
    running(command: string) { return `Running command: ${command}`; }
    compiling() { return 'Compiling...'; }
    done() { return `File ${this._filename} compiled successfully`; }
    invalidExtension() { return 'Expected file with extension ".pyx"'; }
    compileError() { return `Error compiling file: ${this._filename}`; }
    optionOutput() { return 'Show Output'; }
};


function _compile(filename: string, pythonPath: string, reporter: ProgressReporter, callback: () => void) {
    const path = combinePaths(getDirectoryPath(pythonPath), 'cythonize');
    const args = ['-i', '-f'];
    const cmd = [path, ...args];
    cmd.push(filename);
    const command = cmd.join(' ');

    reporter.outputChannel.appendLine(reporter.starting());
    reporter.outputChannel.appendLine(reporter.running(command));
    reporter.outputChannel.appendLine('');

    const messageCallback = (item: string | undefined) => {
        switch (item) {
            case reporter.optionOutput():
                reporter.outputChannel.show();
            default:
                break;
        }
    }

    exec(command, (error, stdout, stderr) => {
        callback();
        reporter.outputChannel.appendLine(stdout);
        reporter.outputChannel.appendLine(stderr);
        let promise: Thenable<string | undefined>;
        if (error?.code !== undefined) {
            reporter.outputChannel.appendLine(reporter.compileError());
            promise = window.showErrorMessage(reporter.compileError(), reporter.optionOutput());
        } else {
            reporter.outputChannel.appendLine(reporter.done());
            promise = window.showInformationMessage(reporter.done(), reporter.optionOutput());
        }
        reporter.outputChannel.appendLine('');
        promise.then(messageCallback);
    });
}

function _compileWithProgress(filename: string, pythonPath: string, reporter: ProgressReporter, callback: () => void) {

    const options = {
        location: ProgressLocation.Notification,
        title: 'Cythonize',
    };

    window.withProgress(
        options,
        async (progress) => {
            progress.report({
                message: reporter.compiling(),
            });
            _compile(filename, pythonPath, reporter, callback);
        }
    );
}

function _compileCurrentFileCommand(uri: Uri, pythonPath: string, outputChannel: OutputChannel, callback: () => void) {
    const filename = uri.path;
    const reporter = new ProgressReporter(filename, outputChannel);

    if (uri.scheme !== 'file') {
        callback();
        return;
    }
    if (!filename.endsWith('.pyx')) {
        reporter.outputChannel.appendLine(reporter.invalidExtension());
        callback();
        return;
    }
    _compileWithProgress(filename, pythonPath, reporter, callback);
}

export class CythonCompiler {
    private _outputChannel: OutputChannel;
    private _pythonPath: string;
    private _compiling: boolean;

    constructor() {
        this._outputChannel = window.createOutputChannel('Cython - compile');
        this._pythonPath = '';
        this._compiling = false;
    }

    private _compilingDone() {
        this._compiling = false;
    }

    setPythonPath(pythonPath: string) {
        this._pythonPath = pythonPath;
    }

    compileCurrentFile(uri: Uri) {
        if (this._pythonPath.length < 1 || this._compiling) {
            return;
        }
        this._compiling = true;
        _compileCurrentFileCommand(uri, this._pythonPath, this._outputChannel, this._compilingDone.bind(this));
    }
};

