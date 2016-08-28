'use strict';
var gulp = require('gulp'),
    jshint = require('gulp-jshint');

gulp.task('default', ['build']);

gulp.task('watch', ['build'], function() {
    gulp.watch('src/*.js', ['build']);
});

gulp.task('lint', function() {
    gulp.src('src/*.js').
            pipe(jshint()).
            pipe(jshint.reporter('jshint-stylish'));
});

gulp.task('build', ['lint'], function() {
    gulp.src(['README.md', 'src/*.js']).
            pipe(gulp.dest('dist'));
});
