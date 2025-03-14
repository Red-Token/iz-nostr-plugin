const path = require('path')

module.exports = {
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
        outputModule: true // Enable ESM output
    }
}
