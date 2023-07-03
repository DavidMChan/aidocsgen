// Description: This file contains the main extension code. It is run when the extension is activated.

import * as vscode from 'vscode';
const { Configuration, OpenAIApi } = require("openai");


export function activate(context: vscode.ExtensionContext) {

	let disposable = vscode.commands.registerCommand('aidocsgen.addDocstrings',async () => {

		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showInformationMessage('No open text editor...');
			return; // No open text editor
		}
		let document = editor.document;
		const documentText = document.getText();

		// Fetch the API key from the extension settings, or prompt the user to enter it if it's not set
		let apiKey = vscode.workspace.getConfiguration().get("aidocsgen.apiKey");
		if (apiKey === undefined || apiKey === "") {
			let inputBoxOptions: vscode.InputBoxOptions = {
				prompt: "Enter your OpenAI API key",
				placeHolder: "Your API key",
				password: false,
			};
			apiKey = await vscode.window.showInputBox(inputBoxOptions).then((apiKey) => {
				if (apiKey === undefined) {
					return "";
				}
				vscode.workspace.getConfiguration().update("aidocsgen.apiKey", apiKey, vscode.ConfigurationTarget.Workspace);
				return apiKey;
			});
		}

		// Make an OpenAI API call to generate docstrings
		const configuration = new Configuration({
			apiKey: apiKey,
		});
		const openai = new OpenAIApi(configuration);

		// Docstring type map
		const docstringTypeMap: {[key: string]: string} = {
			"Google": "google style",
			"NumPy": "numpydoc style",
			"RST": "reStructuredText style",
			"Epytext": "epytext style",
			"Sphinx": "Sphinx style",
		};


		// Create a progress bar
		const progressOptions = {
			location: vscode.ProgressLocation.Notification,
			title: "Generating docstrings...",
			cancellable: false
		};
		vscode.window.withProgress(progressOptions, async (progress) => {

			// Get the generated docstrings
			const docstringType = docstringTypeMap[vscode.workspace.getConfiguration().get("aidocsgen.docstringType") as string];
			console.log("Generating docstrings with type: " + docstringType);

			const generatedDocstrings = await openai.createChatCompletion({
				model: "gpt-3.5-turbo",
				messages: [{role: "user", content: `Add highly detailed ${
					docstringType
				} docstrings to this file: \n\`\`\` ${
					documentText
				}\n\`\`\`\n\nReturn only a markdown-formatted output containing the modified file. Make sure to use the ${
					docstringType
				} format for the docstrings.`}],
			}).then((response: any) => {
				const generatedDocstrings = response.data.choices[0].message.content;

				// If the generated docstrings are in markdown format, we need to strip any of the markdown formatting
				// (e.g. the triple backticks at the beginning and end of the file and the language name)
				// Any other markdown formatting should be preserved, so we can't just strip all markdown formatting
				let generatedDocstringsTrimmed = generatedDocstrings.trim().replace(/^```.*\n/, "").replace(/\n```$/, "") + "\n";
				return generatedDocstringsTrimmed;
			}).catch((err: any) => {
				// If the error is a 401, clear the API key and prompt the user to enter it again
				if (err.response.status === 401) {
					vscode.workspace.getConfiguration().update("aidocsgen.apiKey", "", vscode.ConfigurationTarget.Workspace);
					vscode.window.showErrorMessage('Invalid API key. Please enter your OpenAI API key again.');
					return "";
				}
				// Otherwise, show the error message
				vscode.window.showErrorMessage('Whoops, something went wrong... ```' + err + '```');
				return "";
			});
			return generatedDocstrings;
		}).then((generatedDocstrings) => {
			if (generatedDocstrings === "") {
				return;
			}
			try {

				// Use a workspace edit to replace the document text with the generated docstrings
				const workspaceEdit = new vscode.WorkspaceEdit();
				const firstLine = document.lineAt(0);
				const lastLine = document.lineAt(document.lineCount - 1);
				const textRange = new vscode.Range(firstLine.range.start, lastLine.range.end);
				workspaceEdit.replace(document.uri, textRange, generatedDocstrings);
				vscode.workspace.applyEdit(workspaceEdit);
			} catch (err) {
				vscode.window.showErrorMessage('Whoops, something went wrong... ```' + err + '```');
			}
		});
	});

	context.subscriptions.push(disposable);
}

export function deactivate() {}
