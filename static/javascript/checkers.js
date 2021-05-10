// Checkers Game using WebGL
// AUTHORS: Kylie Norwood and Matt Kosack 
'use strict';

// Global WebGL context variable
let gl;

// Drawing Sizes
const SQUARE_SZ = 2/8;

// Basic Colors
const BLACK = [0.0, 0.0, 0.0, 1.0];

// Square Colors
const DARK_SQUARE = [0.82, 0.55, 0.28, 1.0];
const LIGHT_SQUARE = [1.0, 0.89, 0.67, 1.0];

// Player Colors
const PLAYER_1 = [0.7, 0.0, 0.0, 1.0]; // red
const PLAYER_2 = [0.8, 0.8, 0.8, 1.0]; // light gray

const PLAYER_1_HIGHLIGHT = [0.8, 0.3, 0.3, 1.0]; // lighter red
const PLAYER_2_HIGHLIGHT = [0.9, 0.9, 0.9, 1.0]; // lighter gray

// Other Colors
const POTENTIAL_PIECE = [1.0, 1.0, 0.6, 1.0];


/** 
 * Checkers board 2D Array (initially set to a typical checkers game layout)
 * Empty spaces are represented by 'Empty'
 * Player 1 is represented by 'Player1'
 * Player 2 is represented by Player2
 * Upper right potential piece is 'UpperRight'
 * Upper left potential piece is 'UpperLeft'
 * Lower right potential piece is 'LowerRight'
 * Lower left potential piece is 'LowerLeft'
 * Player 1 King piece is 'Player1King'
 * Player 2 King piece is 'Player2King'
 * Jumps are represented with the same potential piece names, but 'Jump' concatenated to the end
 * */ 
let CHECKERS_BOARD = [
    ['Player1','Empty','Player1','Empty','Player1','Empty','Player1','Empty'],
    ['Empty','Player1','Empty','Player1','Empty','Player1','Empty','Player1'],
    ['Player1','Empty','Player1','Empty','Player1','Empty','Player1','Empty'],
    ['Empty','Empty','Empty','Empty','Empty','Empty','Empty','Empty'],
    ['Empty','Empty','Empty','Empty','Empty','Empty','Empty','Empty'],
    ['Empty','Player2','Empty','Player2','Empty','Player2','Empty','Player2'],
    ['Player2','Empty','Player2','Empty','Player2','Empty','Player2','Empty'],
    ['Empty','Player2','Empty','Player2','Empty','Player2','Empty','Player2']
];


// List of movements and their positional changes in the array
const MOVE_INFO = [
    [1, 1, 'UpperRight'],
    [1, -1, 'UpperLeft'],
    [-1, 1, 'LowerRight'],
    [-1, -1, 'LowerLeft'],
];

// Names of all potential moves
let POTENTIAL_MOVES = [
    'UpperRightJump', 'UpperLeftJump', 'LowerRightJump', 'LowerLeftJump',
    'UpperRight', 'UpperLeft', 'LowerRight', 'LowerLeft'
];

// Previously clicked location of the mouse (set to start as one of the empty spaces)
let lastClicked = [0, 1];

// Boolean to check if it is Player 1's turn
let playerOneTurn = true;


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
    gl.clearColor(...LIGHT_SQUARE); // setup the background color

    // Initialize the WebGL program and data
    gl.program = initProgram();
    initBuffers();
    initEvents();

    // Render the static scene
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

        in vec4 aPosition;
        uniform vec4 uTransformation;
        
        void main() {
            gl_Position = aPosition + uTransformation;
        }`
    );
    // Fragment Shader
    let frag_shader = compileShader(gl, gl.FRAGMENT_SHADER,
        `#version 300 es
        precision mediump float;

        uniform vec4 uColor;
        out vec4 fragColor;

        void main() {
            fragColor = uColor;
        }`
    );

    // Link the shaders into a program and use them with the WebGL context
    let program = linkProgram(gl, vert_shader, frag_shader);
    gl.useProgram(program);
    
    // Get the attribute indices
    program.aPosition = gl.getAttribLocation(program, 'aPosition'); // get the vertex shader attribute "aPosition"

    // Get the uniform indices
    program.uColor = gl.getUniformLocation(program, 'uColor'); // get the vertex shader attribute "uColor"
    program.uTransformation = gl.getUniformLocation(program, 'uTransformation'); // get the vertex shader attribute "uTransformation"
    return program;
}

/**
 * Initialize the data buffers.
 */
function initBuffers() {
    // Coords for the initial checker
    gl.coords = [
        0, 0, 
        SQUARE_SZ, 0, 
        0, SQUARE_SZ,
        SQUARE_SZ, SQUARE_SZ,
    ];
    // Push vertices to the coords array for the initial piece
    circle(1/8, 1/8, 0.1, 64, gl.coords);

    // Create and bind vertex array
    gl.checkersVAO = gl.createVertexArray();
    gl.bindVertexArray(gl.checkersVAO);

    // Load the vertex coordinate data onto the GPU and associate with attribute
    let posBuffer = gl.createBuffer(); // create a new buffer
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer); // bind to the new buffer
    gl.bufferData(gl.ARRAY_BUFFER, Float32Array.from(gl.coords), gl.STATIC_DRAW); // load the data into the buffer
    gl.vertexAttribPointer(gl.program.aPosition, 2, gl.FLOAT, false, 0, 0); // associate the buffer with "aPosition" as length-2 vectors of floats
    gl.enableVertexAttribArray(gl.program.aPosition); // enable this set of data

    // Cleanup
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
}

/**
 * Initialize event handlers
 */
function initEvents() {
    gl.canvas.addEventListener('click', onPieceClick);
}

/**
 * Render the scene. Draw the initial checkers board. Then draw the pieces and their locations 
 * (potential moves if applicable too)
 */
function render() {
    gl.clear(gl.COLOR_BUFFER_BIT);
    // Bind vertex array
    gl.bindVertexArray(gl.checkersVAO);
    // Draw initial board and then draw current game pieces and potential moves (if applicable at the time)
    drawInitialBoardSquares();
    drawBoard();
    // Cleanup
    gl.bindVertexArray(null);
}

/**
 * Draw the initial squares for an 8x8 checkers board.
 */
function drawInitialBoardSquares() {
    for (let i = 0; i < 8; i++) {
        for (let j = 0; j < 8; j++) {
            // Checks to be sure we are drawing a dark colored square at every other location
            if ((i + j) % 2 === 0) {
                // Update color of the square
                gl.uniform4fv(gl.program.uColor, DARK_SQUARE);
                // Apply transformation in the vertex shader
                gl.uniform4f(gl.program.uTransformation, -1 + i/4, -1 + j/4, 0, 0);
                // Draw the square onto the canvas
                gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            }
        }
    }
}

/**
 * Updates uniform color, applies transformation in the vertex shader, and draws the piece(s).
 */
function drawTransformations(x, y, color) {
    gl.uniform4fv(gl.program.uColor, color);
    gl.uniform4f(gl.program.uTransformation, x, y, 0, 0);
    gl.drawArrays(gl.TRIANGLE_FAN, 4, 66);
}

/**
 * Add the vertices for a circle centered at (cx, cy) with a radius of r and n sides to the
 * array coords.
 */
function circle(cx, cy, r, n, coords) {
    // The angle between subsequent vertices
    let theta = 2*Math.PI/n;

    // Push the center vertex (all triangles share this one)
    coords.push(cx, cy);

    // Push the first coordinate around the circle
    coords.push(cx+r, cy);

    // Loop over each of the triangles we have to create
    for (let i = 1; i <= n; ++i) {
        // Push the next coordinate
        coords.push(cx+Math.cos(i*theta)*r, cy+Math.sin(i*theta)*r);
    }
}

/**
 * Draw the pieces for the checkers board based on the current status of the game.
 */
function drawBoard() {
    for (let i = 0; i < 8; i++) {
        for (let j = 0; j < 8; j++) {
            let piece = CHECKERS_BOARD[j][i];
            // If the clicked piece is a player piece, change the color based on that piece
            if (piece.startsWith('Player')) {
                let color = piece.startsWith('Player1') ? PLAYER_1 : PLAYER_2;
                if (lastClicked[0] === j && lastClicked[1] === i) {
                    // Determines the color based on whose turn it is
                    color = piece.startsWith('Player1') ? PLAYER_1_HIGHLIGHT : PLAYER_2_HIGHLIGHT;
                }
                // Draw the shadows for the piece
                drawTransformations(-1 + i/4 + 1/256, -1 + j/4, BLACK);
                
                // Draw the piece's color, depending on the player
                let shift = playerOneTurn === (piece === 'Player1') ? 1/96 : 0;
                drawTransformations(-1 + i/4 - shift, -1 + j/4, color);

                // If the piece is a king, draw an extra piece on top (dependent on who's turn it is)
                if (piece.includes("King")) {
                    drawTransformations(-1 + i/4, -1 + j/4 + 1/96, BLACK); // Shadow for top piece
                    drawTransformations(-1 + i/4  - shift, -1 + j/4 + 1/64, color); // Top piece
                }
            // Draw potential moves 
            } else if (POTENTIAL_MOVES.includes(piece)) {
                drawTransformations(-1 + i/4, -1 + j/4, POTENTIAL_PIECE);
            }
        }
    }
}

/**
 * When the user clicks a piece, update and check the board accordingly. 
 */
function onPieceClick(e) {
    // Get x,y values of the click
    let [x, y] = [Math.floor(e.offsetX / 50), Math.abs(7-Math.floor(e.offsetY / 50))];
    let piece = CHECKERS_BOARD[y][x];
    // Check to make sure a valid piece was clicked (depending on whose turn it is)
    if (piece.startsWith('Player1') && playerOneTurn || piece.startsWith('Player2') && !playerOneTurn) {
        // Clear any potential pieces that are currently on the board
        clearPotentialPieces();
        // Indiciate potential jumps or moves on the board
        updateJumps(x, y);
        updatePotentialPieces(x, y);
        // If there's a king, update the jumps/moves in the other direction as well
        if (piece.includes("King")) {
            updateJumps(x, y);
        }
        // Update the last clicked value
        lastClicked = [y, x];
    } else if (POTENTIAL_MOVES.includes(piece)) {
        // If the user clicks on the potential piece, complete the move
        doPotentialMove(x, y);
        // Check the board to see if a king is now present
        checkForKing();
    }
    render();
}

/**
 * Clear any pieces on the board that were considered potential moves.
 * Only keep player pieces and empty spaces on the board. 
 */
function clearPotentialPieces() {
    // Loop through 8x8 checkers board. 
    for (let i = 0; i < 8; i++) {
        for (let j = 0; j < 8; j++) {
            // Remove any pieces that were considered potential moves (yellow 'pieces')
            if (POTENTIAL_MOVES.includes(CHECKERS_BOARD[i][j])) {
                CHECKERS_BOARD[i][j] = 'Empty';
            }
        }
    }
}

/**
 * Checks to see if there is now a king on the board.
 */
function checkForKing() {
    for (let i = 0; i < 8; i++) {
        // Player one moves to the top of the board - checks if a Player 1 king exists
        if (CHECKERS_BOARD[7][i] === 'Player1') {
            CHECKERS_BOARD[7][i] = 'Player1King';
        }
        // Player two moves to the bottom of the board - checks if a Player 2 king exists
        if (CHECKERS_BOARD[0][i] === 'Player2') {
            CHECKERS_BOARD[0][i] = 'Player2King';
        }
    }
}

/**
 * Updates the array when a move is made. 
 */
function doPotentialMove(x, y) {
    // Check to see if a jump was made - update previous piece to become empty since a jump was completed
    if (CHECKERS_BOARD[y][x] === 'UpperLeftJump') {
        CHECKERS_BOARD[y-1][x+1] = 'Empty';
    } else if (CHECKERS_BOARD[y][x] === 'UpperRightJump') {
        CHECKERS_BOARD[y-1][x-1] = 'Empty';
    } else if (CHECKERS_BOARD[y][x] === 'LowerLeftJump') {
        CHECKERS_BOARD[y+1][x+1] = 'Empty';
    } else if (CHECKERS_BOARD[y][x] === 'LowerRightJump') {
        CHECKERS_BOARD[y+1][x-1] = 'Empty';
    }
    // Update last clicked to the previous position
    CHECKERS_BOARD[y][x] = CHECKERS_BOARD[lastClicked[0]][lastClicked[1]];
    // Update previous position to now become empty
    CHECKERS_BOARD[lastClicked[0]][lastClicked[1]] = 'Empty';
    // Change the player's turn, since a move was completed
    playerOneTurn = !playerOneTurn;
    // Clear the potential moves from the baord
    clearPotentialPieces();
}


/**
 * Updates the array if there are potential basic movements on the board after a piece was clicked. 
 */
function updatePotentialPieces(x, y) {
    // Check to see if we are using a king piece
    let isKing = CHECKERS_BOARD[y][x].includes('King');

    // Update checkers board array to be the name of the potential move (if possible)
    // Check upper right or left potential moves - must be Player 1 or a king
    if ((x-1) >= 0 && (y+1) < 8 && CHECKERS_BOARD[y+1][x-1] === 'Empty' && (playerOneTurn || isKing)) {
        CHECKERS_BOARD[y+1][x-1] = 'UpperLeft';
    }
    if ((x+1) < 8 && (y+1) < 8 && CHECKERS_BOARD[y+1][x+1] === 'Empty' && (playerOneTurn || isKing)) {
        CHECKERS_BOARD[y+1][x+1] = 'UpperRight';
    }
    // Check lower right or left potential moves - must be Player 2 or a king
    if ((x+1) < 8 && (y-1) >= 0 && CHECKERS_BOARD[y-1][x+1] === 'Empty' && (!playerOneTurn || isKing)) {
        CHECKERS_BOARD[y-1][x+1] = 'LowerRight';
    }
    if ((x-1) >= 0 && (y-1) >= 0 && CHECKERS_BOARD[y-1][x-1] === 'Empty' && (!playerOneTurn || isKing)) {
        CHECKERS_BOARD[y-1][x-1] = 'LowerLeft';
    }
}

/**
 * Update the array if there are potential jump movements on the board after a piece was clicked.
 */
function updateJumps(x, y) {
    // Determine who is the opponent
    let opponent = playerOneTurn ? "Player2" : "Player1";
    // Determine if the current piece is a king
    let isKing = CHECKERS_BOARD[y][x].includes('King');

    // Check for all directions and locations if a jump is possible
    for (let [ydir, xdir, name] of MOVE_INFO) {
        // Check to see if a jump is possible (also considers if the piece is a king)
        if (y+2*ydir >= 0 && y+2*ydir < 8 && x+2*xdir >= 0 && x+2*xdir < 8 &&
            CHECKERS_BOARD[y+ydir][x+xdir].startsWith(opponent) && CHECKERS_BOARD[y+2*ydir][x+2*xdir] === 'Empty' && 
            (isKing || (playerOneTurn && ydir === 1) || (!playerOneTurn && ydir=== -1))) {
            // Update the array to indicate a possible jump position
            CHECKERS_BOARD[y+2*ydir][x+2*xdir] = name + "Jump";
        }
    }
}