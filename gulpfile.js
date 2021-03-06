const path = require('path');
const fs = require('fs');
const {promisify} = require('util');
const gulp = require('gulp');
const zip = require('gulp-zip');
const sass = require('gulp-sass');
const UglifyJS = require("uglify-js");

const componentsValidator = require('@woodwing/csde-components-validator');

const readFileAsync = promisify(fs.readFile);
const writeFileAsync = promisify(fs.writeFile);

// Scripts bundled into a single vendor.js
// You can choose to remove scripts in case they are not needed
// for your components.
const scriptsDir = path.join(__dirname, './scripts')
const scriptFiles = [
  // Adobe AEM library used by fullscreen.support.js
  path.join(scriptsDir, 'dpsHTMLGestureAPI.min.js'),

  // JQuery libraries used by below support scripts
  path.join(scriptsDir, 'jquery.js'),
  path.join(scriptsDir, 'jquery.mobile.options.js'),
  path.join(scriptsDir, 'jquery.mobile.js'),

  // Adds tap handler for fullscreen image support on Adobe AEM
  path.join(scriptsDir, 'fullscreen.support.js'),

  // Support scripts for slideshows components
  path.join(scriptsDir, 'jssor.js'),
  path.join(scriptsDir, 'jssor.slider.js'),
  path.join(scriptsDir, 'slideshow.js'),

  // Support script for parallax effect hero components
  path.join(scriptsDir, 'heroes.js'),

  // HLS video support on non Safari browser.
  path.join(scriptsDir, 'video.js')
]

const scssExt = '.scss';

buildScssString = (filename) => {
    return '@import "' + filename.slice(1, (filename.length-scssExt.length)) + '";\n';
}

/**
 * Runs component set validation, but throws no error.
 * Errors are written to stdout.
 */
async function validateNoBail() {
    await componentsValidator.validateFolder('./components');
}

/**
 * Runs component set validation and throws error when something is wrong.
 */
async function validate() {
    const valid = await componentsValidator.validateFolder('./components');
    if (!valid) {
        throw new Error('Package failed validation. See errors above.');
    }
}

/**
 * Generates design.scss from style files.
 */
async function generateDesignFile() {
    let stylesdir = path.join(__dirname, './components/styles');
    let content = '';

    for (let file of fs.readdirSync(stylesdir) ) {
        if (file.startsWith('_') && path.extname(file) === scssExt ) {
            if (file !== '_common.scss') {
                content += buildScssString(file);
            } else {
                // Common should always be included at the top of the file since other scss files have dependencies on it.
                content = buildScssString(file) + content;
            }
        }
    }
    content = '/* \n\
 * This file has been generated while building the components package. \n\
 * PLEASE DO NOT MODIFY THIS FILE BY HAND. \n\
 */\n' + content;
    await writeFileAsync(path.join(stylesdir, 'design.scss'), content);
}

/**
 * Compiles design.scss.
 */
async function compileDesignFile() {
    await generateDesignFile();
    return gulp.src('./components/styles/design.scss')
      .pipe(sass().on('error', sass.logError))
      .pipe(gulp.dest('./components/styles/'));
}

/**
 * Generates vendor script by concatenating and uglifying the result.
 */
async function generateVendorScript() {
    // Concat files
    let content = '';
    for (let i = 0; i < scriptFiles.length; i++) {
        content += (await readFileAsync(scriptFiles[i])).toString() + '\n';
    }
    // Uglify result
    const result = UglifyJS.minify(content);
    if (result.error) {
        throw new Error(result.error.message);
    }
    // Write to vendor.js script
    const targetFolder = './components/scripts';
    if (!fs.existsSync(targetFolder)){
        fs.mkdirSync(targetFolder);
    }
    await writeFileAsync(path.join(targetFolder, 'vendor.js'), result.code);
}

/**
 * Creates component set zip.
 */
function buildComponentSetZip() {
    const name = require('./components/components-definition.json').name;
    return gulp.src(['components/**/*', '!components/**/tms-timestamp'])
        .pipe(zip(`${name}.zip`))
        .pipe(gulp.dest('dist'));
}

/**
 * Watch for changes and re-run component set validation.
 */
function watch() {
    const watcher = gulp.watch('components/**/*', gulp.series(validateNoBail));
    watcher.on('ready', () => console.log('Watching for changes in components folder...'));
    return watcher;
}

const build = gulp.series(gulp.parallel(compileDesignFile, generateVendorScript), validate, buildComponentSetZip);

const dev = gulp.series(gulp.parallel(compileDesignFile, generateVendorScript), watch);

/*
 * Validate component set and produce a zip for uploading in the CS Management Console.
 */
gulp.task('build', build);

/*
 * Validate component set when there are changes.
 */
gulp.task('dev', dev);

/*
 * Define default task that can be called by just running `gulp` from cli
 */
gulp.task('default', build);