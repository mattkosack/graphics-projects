from flask import Flask, render_template

app = Flask(__name__)

@app.route('/')
def index():
	return render_template('index.html')

@app.route('/templates/art_museum.html')
def art_museum():
	return render_template('art_museum.html')

@app.route('/templates/checkers.html')
def checkers():
	return render_template('checkers.html')

@app.route('/templates/drawing.html')
def drawing():
	return render_template('drawing.html')

@app.route('/templates/flightsim.html')
def flightsim():
	return render_template('flightsim.html')


if __name__=='__main__':
	app.run(port=5000)
