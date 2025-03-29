import {execSync} from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import {fileURLToPath} from 'url'
import esbuild from 'esbuild'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outputDir = path.join(__dirname, 'dist', 'extension')
if (!fs.existsSync(path.join(__dirname, 'dist'))) {
	fs.mkdirSync(path.join(__dirname, 'dist'), {recursive: true})
}
if (!fs.existsSync(outputDir)) {
	fs.mkdirSync(outputDir, {recursive: true})
}

const iconsDir = path.join(__dirname, 'src', 'icons')
const destIconsDir = path.join(outputDir, 'icons')
// Create a file containing only the export of the initialization function
fs.writeFileSync(
	path.join(__dirname, 'dist', 'index.js'),
	`export { initializeExtension } from './extension-init.js';\n`
)

// Compile TypeScript files
console.log('Compiling TypeScript files')
try {
	execSync('npm run build:ts', {
		stdio: 'inherit'
	})
	console.log('TypeScript successfully compiled')
} catch (error) {
	console.error('TypeScript compilation error:', error)
	process.exit(1)
}

// Post-processing to add .js extensions to imports
console.log('Adding .js extensions to imports...')
const jsFiles = [
	'background.js',
	'content-script.js',
	'storage.js',
	'common.js',
	'utils.js',
	'nostr-provider.js',
	'common-renderer.js',
	'storage-renderer.js'
]

jsFiles.forEach(file => {
	const filePath = path.join(outputDir, file)
	if (fs.existsSync(filePath)) {
		let content = fs.readFileSync(filePath, 'utf8')

		// Add .js to local imports
		content = content.replace(/from ['"]\.\/([^'"]+)['"]/g, (match, p1) => {
			if (!p1.endsWith('.js')) {
				return `from './${p1}.js'`
			}
			return match
		})

		fs.writeFileSync(filePath, content)
		console.log(`.js extensions added to imports in ${file}`)
	}
})

// Compile JSX files directly to dist/extension
console.log('Compiling JSX files directly to dist/extension')
// const fileTemp = fs.readdirSync(outputDir)

try {
	esbuild.build({
		entryPoints: ['./src/prompt.jsx', './src/options.jsx', './src/popup.jsx'],
		outdir: outputDir,
		bundle: true,
		minify: true,
		platform: 'node',
		format: 'iife',
		jsx: 'automatic',
		sourcemap: false,
		define: {
			'process.env.NODE_ENV': '"production"'
		},
		external: ['electron', 'electron-store']
	})
	console.log('JSX files successfully compiled')
} catch (error) {
	console.error('JSX compilation error:', error)
	process.exit(1)
}

const fileTemp = jsFiles.map(file => `${outputDir}/${file}`)
try {
	esbuild.build({
		entryPoints: [...fileTemp],
		outdir: outputDir,
		// bundle: true,
		minify: true,
		platform: 'node',
		allowOverwrite: true,
		format: 'esm',
		sourcemap: false,
		define: {
			'process.env.NODE_ENV': '"production"'
		}
		// external: ['electron', 'electron-store']
	})
	console.log('JS files successfully compiled')
} catch (error) {
	console.error('JS compilation error:', error)
	process.exit(1)
}

esbuild
	.build({
		entryPoints: ['dist/extension/extension-init.js'],
		outdir: './dist',
		minify: true,
		platform: 'node',

		format: 'esm',
		sourcemap: false,
		define: {
			'process.env.NODE_ENV': '"production"'
		}
	})
	.then(() => {
		console.log('extension-init successfully compiled')
		fs.rm('./dist/extension/extension-init.js', {force: true}, err => {
			if (err) {
				console.error('Error deleting init file:', err)
				return
			}
			console.log('Temp init file successfully deleted.')
		})
		fs.renameSync(
			path.join(outputDir, 'extension-init.d.ts'),
			path.join(outputDir, '..', 'extension-init.d.ts')
		)
		console.log('Module initialization type definitions copied')
	})
	.catch(error => {
		console.error('extension-init compilation error:', error)
		process.exit(1)
	})

try {
	esbuild.build({
		entryPoints: ['dist/extension/preload.js'],
		outdir: outputDir,
		format: 'cjs',
		allowOverwrite: true,
		minify: true,
		platform: 'node',
		sourcemap: false
	})
} catch (error) {
	console.error('preload compilation error:', error)
	process.exit(1)
}
// Copy HTML files, CSS, icons, and manifest.json
console.log('Copying HTML files, CSS, icons and manifest.json')

// Static files to copy
const staticFiles = [
	'prompt.html',
	'options.html',
	'popup.html',
	'manifest.json',
	'styles.css',
	'preload.ts'
]

staticFiles.forEach(file => {
	const sourcePath = path.join(__dirname, 'src', file)
	const destPath = path.join(outputDir, file)

	if (fs.existsSync(sourcePath)) {
		fs.copyFileSync(sourcePath, destPath)
		console.log(`File ${file} copied`)
	} else {
		console.warn(`Warning: File ${file} not found during static file copying`)
	}
})

// Add shim for window.crypto in HTML files
console.log('Adding shim for window.crypto in HTML files')
const htmlFiles = ['options.html', 'prompt.html', 'popup.html']

htmlFiles.forEach(file => {
	const filePath = path.join(outputDir, file)
	if (fs.existsSync(filePath)) {
		let content = fs.readFileSync(filePath, 'utf8')

		const cryptoProtectionScript = `
<script>
Object.defineProperty(window, 'crypto', {
  configurable: false,
  enumerable: true,
  get: function() { return self.crypto; }
});
</script>
`
		if (content.includes('</head>')) {
			content = content.replace('</head>', cryptoProtectionScript + '</head>')
		} else if (content.includes('<script')) {
			content = content.replace('<script', cryptoProtectionScript + '<script')
		} else {
			content = cryptoProtectionScript + content
		}

		fs.writeFileSync(filePath, content)
		console.log(`File ${file} processed (crypto protection added)`)
	}
})

// Copy the icons directory if it exists
if (fs.existsSync(iconsDir)) {
	if (!fs.existsSync(destIconsDir)) {
		fs.mkdirSync(destIconsDir)
	}

	fs.readdirSync(iconsDir).forEach(file => {
		const sourcePath = path.join(iconsDir, file)
		const destPath = path.join(destIconsDir, file)
		fs.copyFileSync(sourcePath, destPath)
	})
	console.log('Icons copied')
} else {
	console.warn('Warning: Icons directory not found')
}

console.log('Extension build completed successfully!')
console.log(`Files are located in directory: ${outputDir}`)
console.log(
	'To use: copy the contents of dist/ into your application and initialize the extension with extension-init.js'
)
