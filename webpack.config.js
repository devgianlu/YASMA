/* eslint-disable @typescript-eslint/no-var-requires */

const path = require('path')
const HtmlWebpackPlugin = require('html-webpack-plugin')
const {DefinePlugin} = require('webpack')

module.exports = (env) => {
	const publicPath = env.production ? '/YASMA/' : '/'

	return {
		context: __dirname,
		entry: './src/index.tsx',
		module: {
			rules: [
				{
					test: /\.tsx?$/,
					use: 'ts-loader',
					exclude: /node_modules/,
				},
				{
					test: /\.css$/,
					use: ['style-loader', 'css-loader'],
				},
			],
		},
		resolve: {
			extensions: ['.tsx', '.ts', '.js'],
		},
		plugins: [
			new HtmlWebpackPlugin({
				filename: 'index.html',
				template: path.join(__dirname, 'public', 'index.html'),
			}),
			new HtmlWebpackPlugin({
				filename: '404.html',
				template: path.join(__dirname, 'public', 'index.html'),
			}),
			new DefinePlugin({
				'__publicPath__': JSON.stringify(publicPath)
			})
		],
		devServer: {
			historyApiFallback: true,
		},
		output: {
			filename: 'bundle.js',
			path: path.resolve(__dirname, 'dist'),
			publicPath: publicPath,
		},
	}
}