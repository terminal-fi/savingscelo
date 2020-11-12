#!/bin/bash
find ./dist/src/tests -name "test*.js" | xargs npm run testone
