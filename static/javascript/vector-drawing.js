// Simple vector drawing program using WebGL.
'use strict';

// Global WebGL context variable
let gl;
let offset = 0;
let modesAndPoints = [];

// Once the document is fully loaded run this init function.
window.addEventListener('load', function init() {
    // Get the HTML5 canvas object from it's ID
    const canvas = document.getElementById('webgl-canvas');
    if (!canvas) { window.alert('Could not find #webgl-canvas'); return; }

    // Get the WebGL context (save into a global variable)
    gl = canvas.getContext('webgl2');
    if (!gl) { window.alert("WebGL isn't available"); return; }

    // Configure WebGL
    gl.viewport(0, 0, canvas.width, canvas.height); // this is the region of the canvas we want to draw on (all of it)
    gl.clearColor(1.0, 1.0, 1.0, 0.0); // setup the background color with red, green, blue, and alpha
    
    // Initialize the WebGL program, buffers, and events
    gl.program = initProgram();
    initBuffers();
    initEvents();

    // Render the scene
    render();
});


/**
 * Initializes the WebGL program.
 */
function initProgram() {
    // Compile shaders
    // Vertex Shader: simplest possible
    let vertShader = compileShader(gl, gl.VERTEX_SHADER,
        `#version 300 es
        precision mediump float;

        in vec4 aPosition;
        in vec4 aColor;

        out vec4 vColor;
        
        void main() {
            gl_Position = aPosition;
            gl_PointSize = 5.0; // make points visible
            vColor = aColor;
        }`
    );
    // Fragment Shader: simplest possible, chosen color is red for each point
    let fragShader = compileShader(gl, gl.FRAGMENT_SHADER,
        `#version 300 es
        precision mediump float;

        in vec4 vColor;
        out vec4 fragColor;

        void main() {
            fragColor = vColor;
        }`
    );

    // Link the shaders into a program and use them with the WebGL context
    let program = linkProgram(gl, vertShader, fragShader);
    gl.useProgram(program);
    
    // Get and save the position and color attribute indices
    program.aPosition = gl.getAttribLocation(program, 'aPosition'); // get the vertex shader attribute "aPosition"
    program.aColor = gl.getAttribLocation(program, 'aColor'); // get the vertex shader attribute "aColor"
    
    return program;
}


/**
 * Initialize the data buffers. This allocates a vertex array containing two array buffers:
 *   * For aPosition, 100000 2-component floats
 *   * For aColor, 100000 3-component floats
 * Both are setup for dynamic drawing.
 */
function initBuffers() {
    // Vertices and colors
    drawColor();

    // Create and bind the VAO
    gl.drawingVAO = gl.createVertexArray();
    gl.bindVertexArray(gl.drawingVAO);

    // Load vertex coordinate data
    gl.posBuffer = gl.createBuffer(); // create buffer
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.posBuffer); // bind the new buffer
    gl.bufferData(gl.ARRAY_BUFFER, 100000*2*Float32Array.BYTES_PER_ELEMENT, gl.DYNAMIC_DRAW); // load the data
    gl.vertexAttribPointer(gl.program.aPosition, 2, gl.FLOAT, false, 0, 0); // associate with "aPosition"
    gl.enableVertexAttribArray(gl.program.aPosition); // enable the data

    // Load the vertex color data
    gl.colorBuffer = gl.createBuffer(); // create buffer
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.colorBuffer); // bind to the new buffer 
    gl.bufferData(gl.ARRAY_BUFFER, 100000*3*Float32Array.BYTES_PER_ELEMENT, gl.DYNAMIC_DRAW); // load the data
    gl.vertexAttribPointer(gl.program.aColor, 3, gl.FLOAT, false, 0, 0); // associate with "aColor" 
    gl.enableVertexAttribArray(gl.program.aColor); // enable the data

    // Cleanup
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
}


/**
 * Initialize the event handlers and initialize any global variables based on the current values
 * in the HTML inputs.
 */
function initEvents() {
    document.getElementById('webgl-canvas').addEventListener('click', onClick);
    document.getElementById('draw-color').addEventListener('change', drawColor);
    
    // Download and upload listeners (E.C.)
    document.getElementById('download-button').addEventListener('click', onDownload);
    document.getElementById('upload-button').addEventListener('click', onUpload);
}


/**
 * Render the scene. 
 */
function render() {
    // Clear the canvas
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Draw the points
    gl.bindVertexArray(gl.drawingVAO);

    // Draws all the shapes and points 
    drawnPoints();
    
    // Clean up
    gl.bindVertexArray(null);
}

/**
 * Goes through each shape and draws its vertices using the appropriate
 * mode and range of vertices.
 */
function drawnPoints() {
    let pointsDrawn = 0;

    // Goes through all modes and associated amount of points for drawing
    for (let i = 0; i < modesAndPoints.length; i++) {
        // Get mode type and number of points associated with that mode type
        let type = modesAndPoints[i][0];
        let numPoints = modesAndPoints[i][1];

        // Draws shapes and points
        gl.drawArrays(gl[type], pointsDrawn, numPoints);

        // Update number of points drawns
        pointsDrawn += numPoints;
    }
}

/**
 * Handler for when the use clicks on the canvas
 */
function onClick(e) {
    // get clicked coordinates
    let [x, y, w, h] = [e.offsetX, e.offsetY, this.width, this.height];

    // Convert x and y from window coordinates (pixels) to clip coordinates (-1,-1 to 1,1)
    let data = [2*x/w-1, 1-2*y/h];

    // Bind coordinates buffer
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.posBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, offset*2, Float32Array.from(data));

    // Bind colors buffer
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.colorBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, offset*3, Float32Array.from(gl.colors));
    offset += Float32Array.BYTES_PER_ELEMENT;

    // Add points to previous draw modes or pushes a new draw mode and a vertex
    if (modesAndPoints.length > 0 && drawMode() === modesAndPoints[modesAndPoints.length-1][0]) {
        modesAndPoints[modesAndPoints.length-1][1]+=1;
    } else {
        modesAndPoints.push([drawMode(), 1]);
    }
    render();
}

/**
 * Handles correct coloring
 */
function drawColor() {
    let aRgb = convertToRGB(document.getElementById("draw-color").value);
    gl.colors = aRgb;
}

/**
 * Converts hex code to RGB.
 */
function convertToRGB(hex) {
    let aRgbHex = hex.substring(1).match(/.{2}/g);

    let aRgb = [
        parseInt(aRgbHex[0], 16) / 255,
        parseInt(aRgbHex[1], 16) / 255,
        parseInt(aRgbHex[2], 16) / 255,
    ]
    return aRgb;
}

/**
 * Retrieve current draw mode.
 */
function drawMode() {
    return document.getElementById('draw-mode').value;
}

/**
 * Downloads vertices and colors to JSON.
 */
function onDownload() {
    // Allocate an array for position and color data
    let bufferPositionData = new Float32Array((offset*2)/4);
    let bufferColorData = new Float32Array((offset*3)/4);

    // Bind position and color buffers
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.posBuffer);
    gl.getBufferSubData(gl.ARRAY_BUFFER, 0, bufferPositionData);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.colorBuffer);
    gl.getBufferSubData(gl.ARRAY_BUFFER, 0, bufferColorData);

    // Stringify position, color, and modes information to be placed in JSON
    let jsonInfo = JSON.stringify(
        {
            "vertices": bufferPositionData,
            "colors": bufferColorData,
            "modes": modesAndPoints 
        }
    );

    // Write information to the JSON file and download from HTML button
    document.body.innerHTML += `<a id="download" download="Vector-Drawing.json" href="${URL.createObjectURL(new Blob([jsonInfo]))}"> Click me</a>`
    document.getElementById('download').click();
    document.getElementById('download').outerHTML = "";

    // Cleanup
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
}

/**
 * Load the JSON file as text.
 */
function onUpload() {
    document.getElementById("upload-button").addEventListener("change", function () {
        let file = this.files[0];
        if (file) {
            let reader = new FileReader();
            // Listen for the JSON file to be loaded
            reader.addEventListener('load', function () {
                // Gets file contents
                file = reader.result;

                // Parses JSON information into an object
                let jsonInfo = JSON.parse(file);

                // Draw JSON shapes and points
                drawFromJSON(jsonInfo)
            })
            reader.readAsText(file);
        }
    },false);
}

/**
 * Draw shapes/points given from uploaded JSON file.
 */
function drawFromJSON(info) {
    // Get the information from the JSON file
    let modes = info.modes;
    let colors = info.colors;
    let vertices = info.vertices;

    modesAndPoints = modes;

    // Bind buffers
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.posBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, Float32Array.from(Object.values(vertices)));

    gl.bindBuffer(gl.ARRAY_BUFFER, gl.colorBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, Float32Array.from(Object.values(colors)));

    // Call render
    render();
}