This pull request adds the JSON schema for `cgmanifest.json`.

## FAQ

### Why?

A JSON schema helps you to ensure that your `cgmanifest.json` file is valid.
JSON schema validation is a build-in feature in most modern IDEs like Visual Studio and Visual Studio Code.

### How can I validate my `cgmanifest.json` file?

Most modern IDEs like Visual Studio and Visual Studio Code have a built-in feature to validate JSON files.
You can also use [this small script](https://github.com/JamieMagee/verify-cgmanifest) to validate your `cgmanifest.json` file.

### Why does it suggest camel case for the properties?

Component Detection is able to read camel case and pascal case properties.
However, the JSON schema doesn't have a case-insensitive mode.
We therefore suggest camel case as it's the most common format for JSON.