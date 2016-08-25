'use strict';
var gulp = require('gulp'),
    jshint = require('gulp-jshint');

gulp.task('default', ['lint'], function() {
    gulp.watch('src/*.js', ['lint']);
});

gulp.task('lint', function() {
    gulp.src('src/*.js').
            pipe(jshint()).
            pipe(jshint.reporter('jshint-stylish'));
});
