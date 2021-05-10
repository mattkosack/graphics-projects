// Authors: Kylie Norwood and Matt Kosack
// Virtual Art Museum

/* globals calc_normals, vec3 */

'use strict';

// Allow use of glMatrix values directly instead of needing the glMatrix prefix
const mat4 = glMatrix.mat4;
const quat = glMatrix.quat;

// Global WebGL context variable
let gl;

// The current position and rotation of the person, x,y,z
let personPosition = [0, 0.6, 0];
let personRotation = [0.0, 0.0, 0.0];

// Number of textures
let texIndex = 0;

// Audio Context utilities
let context;
let gainNode;
let audioBuffer = null;
let audioSource;
let audioPlaying = false;

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
    gl.clearColor(168.0/255.0, 227.0/255.0, 1.0, 1.0); // setup the background color with red, green, blue, and alpha
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);

    // Initialize the WebGL program and data
    gl.program = initProgram();
    initEvents();

    let AudioContext = window.AudioContext || window.webkitAudioContext;
    context = new AudioContext();
    gainNode = context.createGain();
    loadSound()

    // Load models and wait for them all to complete
    Promise.all([
        loadModel('../static/models/cube.json'),
        loadModel('../static/models/degas.json'),
        loadModel('../static/models/van-gogh.json'),
        loadModel('../static/models/pollock.json'),
        loadModel('../static/models/lautrec.json'),
        loadModel('../static/models/luncheon.json'),
        loadModel('../static/models/waterlilies.json'),
        loadModel('../static/models/venus.json'),
        loadModel('../static/models/le_lit.json'),
        loadModel('../static/models/webgl.json'),
        loadModel('../static/models/ribs.json'),
        loadModel('../static/models/nightmark.json'),
        loadModel('../static/models/molecule.json'),
        loadModel('../static/models/pedestal.json'),
        loadModel('../static/models/flower.json'),
        loadModel('../static/models/starry-night.json'),
        loadModel('../static/models/cezanne.json'),
        loadModel('../static/models/prague.json'),
        loadModel('../static/models/bridge-of-sighs.json')
    ]).then(
        models => {
            // All models have now fully loaded
            // Now we can add user interaction events and render the scene
            // The provided models is an array of all of the loaded models
            // Each model is a VAO and a number of indices to draw
            gl.models = models;
            onWindowResize();
            initEvents();
            render();
        }
    );

    // Set initial values of view matrix and light position
    onWindowResize();
    updateViewMatrix([0, 0, 0]);
    gl.uniform1i(gl.program.uTexture, 0);
});


/**
 * Initializes the WebGL program.
 */
function initProgram() {
    // Compile shaders
    // Vertex Shader
    let vert_shader = compileShader(gl, gl.VERTEX_SHADER,
        `#version 300 es
        precision mediump float;

        uniform mat4 uViewMatrix;
        uniform mat4 uModelMatrix;
        uniform mat4 uProjectionMatrix;

        const vec4 light = vec4(0,2,0,1);

        in vec4 aPosition;
        in vec3 aNormal;
        in vec2 aTexCoord;

        out vec3 vNormalVector;
        out vec3 vLightVector;
        out vec3 vEyeVector;
        out vec2 vTexCoord;

        void main() {
            mat4 MV = uViewMatrix * uModelMatrix;
            vec4 lightPos = uViewMatrix * light;

            vec4 P = MV * aPosition;
            vNormalVector = mat3(MV) * aNormal;
            vLightVector = lightPos.w == 1.0 ? P.xyz - lightPos.xyz : lightPos.xyz;
            vEyeVector = -P.xyz;
            gl_Position = uProjectionMatrix * P;

            vTexCoord = aTexCoord;
        }`
    );

    let frag_shader = compileShader(gl, gl.FRAGMENT_SHADER,
        `#version 300 es
        precision mediump float;

        // Material properties
        const vec3 lightColor = vec3(1.0, 1.0, 1.0);
        uniform vec3 uMaterialAmbient;
        uniform vec3 uMaterialDiffuse;
        uniform float uMaterialShininess;

        // Vectors (varying variables from vertex shader)
        in vec3 vNormalVector;
        in vec3 vLightVector;
        in vec3 vEyeVector;

        // Light intensity
        const vec3 lightAttenuation = vec3(1.4, 0.0, 0.0);

        uniform bool uIsTexture;
        uniform sampler2D uTexture;
        in vec2 vTexCoord;

        // Output color of the fragment
        out vec4 fragColor;

        void main() {
            // Normalize vectors
            vec3 N = normalize(vNormalVector);
            vec3 L = normalize(vLightVector);
            vec3 E = normalize(vEyeVector);

            float d = length(vLightVector);
            float attenuation = 1.0 / (lightAttenuation[0] + lightAttenuation[1] * d + lightAttenuation[2] * d * d);

            // Compute lighting
            float diffuse = dot(-L, N);
            float specular = 0.0;
            if (diffuse < 0.0) {
                diffuse = 0.0;
            } else {
                vec3 R = reflect(L, N);
                specular = pow(max(dot(R, E), 0.0), uMaterialShininess);
            }

            // Compute final color
            if (uIsTexture) {
                vec4 color = texture(uTexture, vTexCoord);
                fragColor.rgb = ((uMaterialAmbient + uMaterialDiffuse * diffuse * attenuation) * color.rgb + specular * attenuation) * lightColor;
            } else {
                fragColor.rgb = ((uMaterialAmbient + uMaterialDiffuse * diffuse * attenuation) + specular * attenuation) * lightColor;
            }
            fragColor.a = 1.0;
        }`
    );

    // Link the shaders into a program and use them with the WebGL context
    let program = linkProgram(gl, vert_shader, frag_shader);
    gl.useProgram(program);
    
    // Get the attribute indices
    program.aPosition = gl.getAttribLocation(program, 'aPosition');
    program.aNormal = gl.getAttribLocation(program, 'aNormal');
    program.aTexCoord = gl.getAttribLocation(program, 'aTexCoord');

    // Get the uniform indices
    program.uProjectionMatrix = gl.getUniformLocation(program, 'uProjectionMatrix');
    program.uModelMatrix = gl.getUniformLocation(program, 'uModelMatrix');
    program.uViewMatrix = gl.getUniformLocation(program, 'uViewMatrix');
    program.uMaterialAmbient = gl.getUniformLocation(program, 'uMaterialAmbient');
    program.uMaterialDiffuse = gl.getUniformLocation(program, 'uMaterialDiffuse');
    program.uMaterialShininess = gl.getUniformLocation(program, 'uMaterialShininess');
    program.uTexture = gl.getUniformLocation(program, 'uTexture');
    program.uIsTexture = gl.getUniformLocation(program, 'uIsTexture');

    return program;
}


/**
 * Creates a VAO containing the coordinates, normals, and indices provided
 */
function createVao(coords, indices, tex_coords, is_strip, has_texture) {
    coords = Float32Array.from(coords); // Create this once, since it will be used twice
    tex_coords = Float32Array.from(tex_coords);

    // Create and bind VAO
    let vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    // Load the coordinate data into the GPU and associate with shader
    let buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, coords, gl.STATIC_DRAW);
    gl.vertexAttribPointer(gl.program.aPosition, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(gl.program.aPosition);

    // Load the normal data into the GPU and associate with shader
    buf = gl.createBuffer();
    let normals = calc_normals(coords, indices, is_strip);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, normals, gl.STATIC_DRAW);
    gl.vertexAttribPointer(gl.program.aNormal, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(gl.program.aNormal);

    // Load the texture coordinate data into the GPU and associate with shader
    if (has_texture) {
        buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, tex_coords, gl.DYNAMIC_DRAW);
        gl.vertexAttribPointer(gl.program.aTexCoord, 2, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(gl.program.aTexCoord);
    }

    // Load the index data into the GPU
    buf = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buf);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, Uint16Array.from(indices), gl.DYNAMIC_DRAW);

    // Cleanup
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);

    // Return the VAO handle
    return vao;
}


/**
 * Initialize event handlers.
 */
function initEvents() {
    // Events for moving
    window.addEventListener('resize', onWindowResize);
    window.addEventListener('keydown', onKeyDown);
}

/**
 * Handler for when the user presses any of the keys for movement. 
 * Update view and position based on the key pressed.
 */
function onKeyDown(e) {
    // Keys pressed for translations
    if (e.key === 'ArrowUp') {
        // Move forward
        updateViewMatrix([0.0,0.0,0.1]);
    } else if (e.key === 'ArrowDown') {
        // Move backward
        updateViewMatrix([0.0,0.0,-0.1]);
    } else if (e.key === 'p') {
        // Start or Stop the audio
        changeAudioStatus();
    } else {
        // Keys pressed for rotation of view
        if (e.key === 'ArrowLeft') {
            // Rotate left
            personRotation[1] += -2;
        } else if (e.key === 'ArrowRight') {
            // Rotate right
            personRotation[1] += 2;
        }
        updateViewMatrix(vec3.create());
    }
}

/**
 * Update the view matrix based on the person's current position and view (dependent 
 * on the movements of the clicked keys).
 */
function updateViewMatrix(personDirection) {
    // Rotate person's view 
    vec3.rotateY(personDirection, personDirection, [0,0,0], -deg2rad(personRotation[1]));

    if (canMove(personDirection)) {
        vec3.add(personPosition, personPosition, personDirection);

        // Rotate person
        let view = generateViewMatrix(personPosition, personRotation);
        // Update uniform indices with the transformations
        gl.uniformMatrix4fv(gl.program.uViewMatrix, false, view);
    }
}


/**
 * Generates the view matrix dependent on the position and rotation.
 * This is the inverse of generateModelMatrix() in that this translates than rotates.
 */
function generateViewMatrix(position, rotation) {
    let dest = mat4.fromQuat(mat4.create(), quat.fromEuler(quat.create(), ...rotation));
    mat4.translate(dest, dest, position);
    return dest;
}


/**
 * Generates the model matrix dependent on the position, rotation, and scale if applicable.
 */
function generateModelMatrix(position, rotation, scale) {
    return mat4.fromRotationTranslationScale(mat4.create(), 
        quat.fromEuler(quat.create(), ...rotation), position, scale);
}


/**
 * Updates the projection matrix.
 */
function updateProjectionMatrix() {
    // Create the perspective projection matrix
    let [w, h] = [gl.canvas.width, gl.canvas.height];
    let fovy = deg2rad(60);
    let p = mat4.perspective(mat4.create(), fovy, w/h, 0.00001, 10);
    gl.uniformMatrix4fv(gl.program.uProjectionMatrix, false, p);
}

/**
 * Keep the canvas sized to the window and initialize projection matrix.
 */
function onWindowResize() {
    let [w, h] = [window.innerWidth, window.innerHeight];
    gl.canvas.width = w;
    gl.canvas.height = h;
    gl.viewport(0, 0, w, h);
    updateProjectionMatrix();
}

/**
 * Determines if the person can move dependent on the bounds of the museum. 
 * Museum size is 3 x 1 x 3.
 * Don't need to check Y bounds because we aren't moving up or down. 
 * Bounds of x and Z are slightly less than the size of the cube to ensure we stay away from the walls.
 */
function canMove(personDirection) {
    let potentialPosition = vec3.add(vec3.create(), personPosition, personDirection);
    let checkX = -2.5 < potentialPosition[0] && potentialPosition[0] < 2.5;
    let checkZ = -2.5 < potentialPosition[2] && potentialPosition[2] < 2.5;
    return checkX && checkZ;
}

/**
 * Load a texture onto the GPU. The second argument is the texture number (default 0).
 */
function loadTexture(img, index) {
    // Default argument value
    if (typeof index === 'undefined') { index = 0; }

    // Create, set, assign and flip the texture
    let texture = gl.createTexture();
    gl.activeTexture(gl['TEXTURE' + index]);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

    // Load the image data into the texture
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);

    // Setup options for downsampling and upsampling the image data
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    // Cleanup and return
    gl.bindTexture(gl.TEXTURE_2D, null);
    return texture;
}


/**
 * Render the scene.
 */
function render(ms) {
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    if (!ms) { ms = performance.now(); }

    // Move objects as needed then bind VAO and draw each of the models (lighting included)
    for (let [vao, count, ambient, diffuse, shininess, location, texture, isAnimated] of gl.models) {
        gl.uniform3fv(gl.program.uMaterialAmbient, ambient);
        gl.uniform3fv(gl.program.uMaterialDiffuse, diffuse);
        gl.uniform1f(gl.program.uMaterialShininess, shininess);

        // Perform the animation on an object dependent on MS
        if (isAnimated) {
            let z = ms / 1000;
            location[1][1] = 45*z;
            gl.uniformMatrix4fv(gl.program.uModelMatrix, false, generateModelMatrix(...location));
        } else if (texture.length !== 0) {
            // Apply textures to objects
            gl.disable(gl.DEPTH_TEST);
            gl.uniform1i(gl.program.uIsTexture, true);
            gl.uniform1i(gl.program.uTexture, texture[1]);
            gl.activeTexture(gl['TEXTURE' + texture[1]]);
            gl.bindTexture(gl.TEXTURE_2D, texture[0]);
            gl.uniformMatrix4fv(gl.program.uModelMatrix, false, generateModelMatrix(...location));
        } else {
            // Set model matrix to the position of the model
            gl.uniformMatrix4fv(gl.program.uModelMatrix, false, generateModelMatrix(...location));
        }

        gl.bindVertexArray(vao);
        gl.drawElements(gl.TRIANGLES, count, gl.UNSIGNED_SHORT, 0);
        gl.uniform1i(gl.program.uIsTexture, false);
        gl.enable(gl.DEPTH_TEST);
    }

    // Cleanup
    gl.bindVertexArray(null);
    for (let i=0; i < texIndex; i++) {
        gl.activeTexture(gl['TEXTURE' + texIndex]);
        gl.bindTexture(gl.TEXTURE_2D, null);
    }

    window.requestAnimationFrame(render);
}

/**
 * Converts degrees to radians.
 */
function deg2rad(degrees) {
    return degrees * Math.PI / 180;
}

/**
 * Load a model from a file into a VAO and return the VAO.
 */
function loadModel(filename) {
    return fetch(filename)
        .then(r => r.json())
        .then(raw_model => {
            let has_texture = true;
            // Create and bind the VAO
            if (typeof raw_model.tex_coords === 'undefined') {
                raw_model.tex_coords = [];
                has_texture = false;
            }
            let vao = createVao(raw_model.vertices, raw_model.indices, raw_model.tex_coords, false, has_texture);

            
            let texture = [];
            if (typeof raw_model.texture === 'string') {
                let url = '../static/textures/' + raw_model.texture;
                loadImage(texture, url);
            }

            // Return the VAO, number of indices, and other characteristics of the model
            return [vao, raw_model.indices.length,
                raw_model.ambient_color, raw_model.diffuse_color, 
                raw_model.shininess, raw_model.location, texture, 
                raw_model.animated, raw_model.name];
        })
        // eslint-disable-next-line no-console
        .catch(console.error);
}

/**
 * Load an image.
 */
function loadImage(texture, url) {
    return new Promise(resolve => {
        let image = new Image();
        image.addEventListener('load', () => {
            texture.push(loadTexture(image, texIndex), texIndex);
            texIndex++;
            resolve(image);
        });
        image.src = url;
    });
}


/**
 * Load sound into the created audio context.
 */
function loadSound() {
    // Set the audio file's URL
    let audioURL = '../static/Prelude.mp3';

    // Create a new request
    let request = new XMLHttpRequest();
    request.open("GET", audioURL, true);
    request.responseType= 'arraybuffer';
    request.onload = function () {
        // Take the audio from http request and decode it in an audio buffer
        context.decodeAudioData(request.response, function (buffer) {
            audioBuffer = buffer;
        });
    };
    request.send();
}

/**
 * Play the music file.
 */
function playSound() {
    // Creating source node
    audioSource = context.createBufferSource();
    // Passing in file
    audioSource.buffer = audioBuffer;
    audioSource.connect(gainNode);
    // Start playing
    gainNode.connect(context.destination);
    // Volume, 0 is mute
    gainNode.gain.setValueAtTime(0.5, context.currentTime);
    audioSource.start(0);
}

/**
 * Change whether or not the audio is playing.
 */
function changeAudioStatus() {
    if (audioPlaying) {
        // Stop the sound
        audioPlaying = false;
        audioSource.stop(0);
    } else {
        audioPlaying = true;
        playSound();
    }
}