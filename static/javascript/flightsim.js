// Authors: Kylie Norwood and Matt Kosack
// Basic Flight Simulator

/* globals generate_terrain, generate_mesh, calc_normals, line_seg_triangle_intersection, vec3 */

'use strict';

// Allow use of glMatrix values directly instead of needing the glMatrix prefix
const mat4 = glMatrix.mat4;

// Global WebGL context variable
let gl;

// The current position and rotation of the flyer, x,y,z
let position;
let rotation = [0.0, 0.0, 0.0];

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
    initBuffers();
    initEvents();

    // Set initial values of uniforms
    updateProjectionMatrix();
    setInitialFlyerPosition();
    updateLightPositon();
    gl.uniformMatrix4fv(gl.program.uView, false, mat4.create());
    gl.uniform3fv(gl.program.uLightAmbient, stringToColor('#FFFFFF'));
    gl.uniform3fv(gl.program.uLightDiffuse, stringToColor('#FFFFFF'));
    gl.uniform3fv(gl.program.uLightSpecular, stringToColor('#FFFFFF'));
    gl.uniform3fv(gl.program.uMaterialAmbient, stringToColor('#005005'));
    gl.uniform3fv(gl.program.uMaterialDiffuse, stringToColor('#019D1B'));
    gl.uniform3fv(gl.program.uMaterialSpecular, stringToColor('#579142'));

    // Render the static scene
    onWindowResize();
    render();
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

        uniform mat4 uProjectionMatrix;
        uniform mat4 uModelViewMatrix;
        uniform mat4 uView;

        uniform vec4 uLight;

        in vec4 aPosition;
        in vec3 aNormal;

        in vec3 aColor;
        out vec3 vColor;

        out vec3 vNormalVector;
        out vec3 vLightVector;
        out vec3 vEyeVector;

        void main() {
            vec4 lightPos = uView * uLight;

            vec4 P = uModelViewMatrix * aPosition;
            vNormalVector = mat3(uModelViewMatrix) * aNormal;
            vLightVector = lightPos.w == 1.0 ? P.xyz - lightPos.xyz : lightPos.xyz;
            vEyeVector = -P.xyz;
            gl_Position = uProjectionMatrix * P;

            vColor = aColor;
        }`
    );

    let frag_shader = compileShader(gl, gl.FRAGMENT_SHADER,
        `#version 300 es
        precision mediump float;

        // Material properties
        const vec3 lightColor = vec3(1.0, 1.0, 1.0);
        uniform vec3 uMaterialAmbient;
        uniform vec3 uMaterialDiffuse;
        uniform vec3 uMaterialSpecular;
        const float materialShininess = 10.0;

        // Vectors (varying variables from vertex shader)
        in vec3 vNormalVector;
        in vec3 vLightVector;
        in vec3 vEyeVector;

        // Fragment base color
        in vec3 vColor;

        // Output color of the fragment
        out vec4 fragColor;

        void main() {
            // Normalize vectors
            vec3 N = normalize(vNormalVector);
            vec3 L = normalize(vLightVector);
            vec3 E = normalize(vEyeVector);

            // Compute lighting
            float diffuse = dot(-L, N);
            float specular = 0.0;
            if (diffuse < 0.0) {
                diffuse = 0.0;
            } else {
                vec3 R = reflect(L, N);
                specular = pow(max(dot(R, E), 0.0), materialShininess);
            }
            
            // Compute final color
            fragColor.rgb = ((uMaterialAmbient + uMaterialDiffuse * diffuse) * vColor + uMaterialSpecular * specular) * lightColor;
            fragColor.a = 1.0;
        }`
    );

    // Link the shaders into a program and use them with the WebGL context
    let program = linkProgram(gl, vert_shader, frag_shader);
    gl.useProgram(program);
    
    // Get the attribute indices
    program.aPosition = gl.getAttribLocation(program, 'aPosition');
    program.aColor = gl.getAttribLocation(program, 'aColor');
    program.aNormal = gl.getAttribLocation(program, 'aNormal');

    // Get the uniform indices
    program.uProjectionMatrix = gl.getUniformLocation(program, 'uProjectionMatrix');
    program.uModelViewMatrix = gl.getUniformLocation(program, 'uModelViewMatrix');
    program.uView = gl.getUniformLocation(program, 'uView');
    program.uLight = gl.getUniformLocation(program, 'uLight');
    program.uLightAmbient = gl.getUniformLocation(program, 'uLightAmbient');
    program.uLightDiffuse = gl.getUniformLocation(program, 'uLightDiffuse');
    program.uLightSpecular = gl.getUniformLocation(program, 'uLightSpecular');
    program.uMaterialAmbient = gl.getUniformLocation(program, 'uMaterialAmbient');
    program.uMaterialDiffuse = gl.getUniformLocation(program, 'uMaterialDiffuse');
    program.uMaterialSpecular = gl.getUniformLocation(program, 'uMaterialSpecular');
    program.uMaterialShininess = gl.getUniformLocation(program, 'uMaterialShininess');

    return program;
}

/**
 * Initialize the data buffers.
 */
function initBuffers() {
    // Generate the terrain and its colors
    gl.terrain = generate_terrain(7, 0.006);

    // Get the terrain coordinates and indices 
    [gl.coords, gl.indices] = generate_mesh(gl.terrain);
    gl.colors = [];

    // Compute the colors for the terrain based on the altitutde
    generateAltitudeColors();

    // Create and bind VAO
    gl.vao = gl.createVertexArray();
    gl.bindVertexArray(gl.vao);

    // Load the coordinate data into the GPU and associate with shader
    let buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, gl.coords, gl.STATIC_DRAW);
    gl.vertexAttribPointer(gl.program.aPosition, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(gl.program.aPosition);

    // Load the normal data into the GPU and associate with shader
    buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, Float32Array.from(gl.colors), gl.STATIC_DRAW);
    gl.vertexAttribPointer(gl.program.aColor, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(gl.program.aColor);

    // Load the normal data into the GPU and associate with shader
    buf = gl.createBuffer();
    let normals = calc_normals(gl.coords, gl.indices);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, normals, gl.STATIC_DRAW);
    gl.vertexAttribPointer(gl.program.aNormal, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(gl.program.aNormal);

    // Load the indices onto the GPU and associate with attribute
    buf = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buf);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, gl.indices, gl.STATIC_DRAW); 

    // Cleanup
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
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
 * Update model view matrix/globals based on the key pressed.
 * x is pitch, y is yaw, z is roll movement
 */
function onKeyDown(e) {
    // Keys pressed for translations
    if (e.key === 'ArrowUp') {
        // Move forward
        updateModelViewMatrix([0.0,0.0,0.1]);
    } else if (e.key === 'ArrowDown') {
        // Move backward
        updateModelViewMatrix([0.0,0.0,-0.1]);
    } else {
        // Keys pressed for rotations
        if (e.key === 'ArrowLeft') {
            // Rotate left (yaw)
            rotation[1] += -5;
        } else if (e.key === 'ArrowRight') {
            // Rotate right (yaw)
            rotation[1] += 5;
        } else if (e.key === 'd') {
            // Rotate counterclockwise (roll)
            rotation[2] += 1;
        } else if (e.key === 'a') {
            // Rotate clockwise (roll)
            rotation[2] += -1;
        } else if (e.key === 's') {
            // Rotate up (pitch)
            rotation[0] += 1;
        }  else if (e.key === 'w') {
            // Rotate down (pitch)
            rotation[0] += -1;
        } 
        updateModelViewMatrix(vec3.create());
    }
}

/**
 * Update the model view matrix based on the flyer's current position and view (dependent 
 * on the movements of the clicked keys).
 */
function updateModelViewMatrix(flyerDirection) {
    // Rotate flyer's view 
    vec3.rotateX(flyerDirection, flyerDirection, [0,0,0], deg2rad(-rotation[0]));
    vec3.rotateY(flyerDirection, flyerDirection, [0,0,0], deg2rad(-rotation[1]));
    vec3.rotateZ(flyerDirection, flyerDirection, [0,0,0], deg2rad(-rotation[2]));

    // Only perform the following transformations if there are no collisions and the flyer is in bounds of the terrain
    if (!isCollision(flyerDirection) && checkBounds(flyerDirection)) {
        vec3.add(position, position, flyerDirection);

        // Rotate flyer
        let flyerRotation = mat4.fromXRotation(mat4.create(), deg2rad(rotation[0]));
        mat4.rotateY(flyerRotation, flyerRotation, deg2rad(rotation[1]));
        mat4.rotateZ(flyerRotation, flyerRotation, deg2rad(rotation[2]));

        // Translate flyer to new position
        let flyerTranslation = mat4.translate(mat4.create(), flyerRotation, position);

        // Update uniform indices with the transformations
        gl.uniformMatrix4fv(gl.program.uModelViewMatrix, false, flyerTranslation); // translation
        gl.uniformMatrix4fv(gl.program.uView, false, flyerRotation); // view
    }
}

/**
 * Updates the projection matrix.
 */
function updateProjectionMatrix() {
    // Create the perspective projection matrix
    let [w, h] = [gl.canvas.width, gl.canvas.height];
    let fovy = deg2rad(60);
    let p = mat4.perspective(mat4.create(), fovy, w/h, 0.00001, 5);
    gl.uniformMatrix4fv(gl.program.uProjectionMatrix, false, p);
}

/**
 * Keep the canvas sized to the window.
 */
function onWindowResize() {
    let [w, h] = [window.innerWidth, window.innerHeight];
    gl.canvas.width = w;
    gl.canvas.height = h;
    gl.viewport(0, 0, w, h);
}


/**
 * Render the scene. Must be called once and only once. It will call itself again.
 * Update the position of the light (sun) dependent on the time of day as well.
 */
function render() {
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    updateLightPositon();

    // Bind VAO and draw the scene
    gl.bindVertexArray(gl.vao);
    gl.drawElements(gl.TRIANGLE_STRIP, gl.indices.length, gl.UNSIGNED_SHORT, 0);
    gl.bindVertexArray(null);

    window.requestAnimationFrame(render);
}

/**
 * Set the flyer's initial position.
 */
function setInitialFlyerPosition() {
    // Determine the center of the terrain
    let middle = Math.floor(gl.terrain.length / 2);
    let y = gl.terrain[middle][middle];

    // Set the position to the center of the terrain
    position = [0.0, y-0.2, 0.0];

    // Perform translation and update the model view matrix accordingly
    let mv = mat4.fromTranslation(mat4.create(), position);
    gl.uniformMatrix4fv(gl.program.uModelViewMatrix, false, mv);
}

/**
 * Determine shades of green based on the altitude values (ranges in increments of 0.25) 
 */
function generateAltitudeColors() {
    // Loop through the 2D array of terrain altitudes and determine the shade of green accordingly 
    for (let i=0; i < gl.terrain.length; i++) {
        for (let j=0; j < gl.terrain.length; j++) {
            if (gl.terrain[i][j] < -0.5) {
                gl.colors.push(0, 0, 0);
            } else if (gl.terrain[i][j] >= -0.5 && gl.terrain[i][j] < -0.25) {
                gl.colors.push(0, 0.2, 0);
            } else if (gl.terrain[i][j] >= -0.25 && gl.terrain[i][j] < 0) {
                gl.colors.push(0, 0.4, 0);
            } else if (gl.terrain[i][j] >= 0 && gl.terrain[i][j] < 0.25) {
                gl.colors.push(0, 0.6, 0);
            } else if (gl.terrain[i][j] >= 0.25 && gl.terrain[i][j] < 0.5) {
                gl.colors.push(0, 0.8, 0);
            } else {
                gl.colors.push(0, 1, 0);
            }
        }
    }
}

/**
 * Change and update the light position based on the current hour.
 */
function updateLightPositon() {
    let lightPostion = [0.0, -25.0, 0.0, 1.0];
    let hour = new Date().getHours(); 
    // let hour = 12;
    vec3.rotateZ(lightPostion, lightPostion, [0,0,0], deg2rad(hour * (360/24)));
    gl.uniform4fv(gl.program.uLight, lightPostion);
}


/**
 * Check if the new position of the flyer will intersect a triangle, based on the current direction of the flyer.
 */
function isCollision(flyerDirection) {
    // Detect the collision
    let pos = vec3.negate(vec3.create(), position);
    let dir = vec3.negate(vec3.create(), flyerDirection);
    for (let i = 0; i < gl.indices.length - 2; i += 1) {
        // Get the indices of the triangle and then get pointers its coords and normals
        let j = gl.indices[i]*3, k = gl.indices[i+1]*3, l = gl.indices[i+2]*3;
        let A = gl.coords.subarray(j, j+3), B = gl.coords.subarray(k, k+3), C = gl.coords.subarray(l, l+3);
        let p = line_seg_triangle_intersection(pos, dir, A, B, C);
        // Return true if a collision was found
        if (p !== null) {
            return true;
        }
    }
    return false;
} 

/**
 * Checks if the flyer is within the bounds of the terrain, based on the current direction of the flyer.
 */
function checkBounds(flyerDirection) {
    let potentialPosition = vec3.add(vec3.create(), position, flyerDirection);
    let checkX = -1 < potentialPosition[0] && potentialPosition[0] < 1;
    let checkY = -1 < potentialPosition[1] && potentialPosition[1] < 1;
    let checkZ =  -1 < potentialPosition[2] && potentialPosition[2] < 1;
    return checkX && checkY && checkZ;
}


/**
 * Takes a color string (like "#89abcd") and returns to a 3 element Float32Array of red, green, and
 * blue amounts ranging from 0.0 to 1.0 each.
 */
function stringToColor(str) {
    return Float32Array.of(
        parseInt(str.substr(1, 2), 16) / 255.0,
        parseInt(str.substr(3, 2), 16) / 255.0,
        parseInt(str.substr(5, 2), 16) / 255.0
    );
}

/**
 * Converts degrees to radians.
 */
function deg2rad(degrees) {
    return degrees * Math.PI / 180;
}
