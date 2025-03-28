import path from 'path'
import {fileURLToPath} from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default {
    mode: 'production',
    entry: './src/background.ts',
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: 'test-background.bundle.js'
    },
    resolve: {
        extensions: ['.ts', '.js']
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                use: 'ts-loader',
                exclude: /node_modules/
            }
        ]
    },
    experiments: {
        outputModule: true
    }
}
