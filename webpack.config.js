const path = require("path");
const cp = require("child_process");

const CopyPlugin = require('copy-webpack-plugin');
const WebextensionPlugin = require('webpack-webextension-plugin');
const webpack = require('webpack');

const config = {
    entry: {
        content_script: path.join(__dirname, "src/content_script.ts"),
    },
    output: {
        filename: "[name].js",
        path: path.join(__dirname, "dist"),
    },
    resolve: {
        extensions: [".ts"],
    },
    module: {
        rules: [
            { test: /\.tsx?$/, use: "ts-loader" },
        ]
    },
    optimization: {
        minimize: false,
    },
    plugins: [
        new CopyPlugin([
            { from: "**/*", context:"assets/" },
        ]),
        new WebextensionPlugin({
            vendor: "firefox",
        }),
    ],
};

switch (process.env.NODE_ENV) {
    case undefined:
    case "production":
        config.mode = "production";
        config.devtool = "source-map";
        break;
    case "development":
        config.mode = "development";
        config.devtool = "eval-cheap-module-source-map";
        config.plugins.push(new webpack.ProgressPlugin(function(percentage) {
            if (percentage === 1) {
                const result = cp.execSync("npx ts-node tests/parser_coverage.ts", {
                    encoding: "utf-8"
                });
                console.log(result);
            }
        }));
        break;
    default:
        throw Error(`unkown NODE_ENV: "${process.env.NODE_ENV}"`)
}

module.exports = config;
