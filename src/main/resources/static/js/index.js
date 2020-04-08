class Ws extends Object {
	get newClientPromise(){
		return new Promise((resolve, reject)=> {
				let wsClient = new WebSocket('wss://' + location.host + '/call');
				console.log(wsClient)
				wsClient.onopen = () => {
					console.log("connected");
					resolve(wsClient);
				};
				wsClient.onerror = (error)=>{ reject(error); };
				wsClient.onmessage = function(message) {
					var parsedMessage = JSON.parse(message.data);
					console.info('Received message: ' + message.data);

					switch (parsedMessage.id) {
						case 'presenterResponse':
							presenterResponse(parsedMessage);
							break;
						case 'viewerResponse':
							viewerResponse(parsedMessage);
							break;
						case 'iceCandidate':
							screenPeer.addIceCandidate(parsedMessage.candidate, function(error) {
								if (error)
									return console.error('Error adding candidate: ' + error);
							});
							break;
						case 'stopCommunication':
							dispose();
							break;
						default:
							console.error('Unrecognized message', parsedMessage);
					}
				}
			}
		)
	}
	get clientPromise(){
		var stompClientPromise = this.stompClientPromise
		if (!stompClientPromise)
			stompClientPromise = this.newClientPromise
		this.stompClientPromise = stompClientPromise
		return stompClientPromise;
	}
}

// var ws = new WebSocket('wss://' + location.host + '/call');
ws = new Ws();
var screenVideo;
var screenPeer;

window.onload = function() {
	console = new Console();
	screenVideo = document.getElementById('screenVideo');
	disableStopButton();
}

window.onbeforeunload = function() {
	// ws.close();
	ws.clientPromise
		.then( wsClient =>{wsClient.close(); console.log('Web socket closed')})
		.catch( error => alert(error) )
}

// ws.onmessage = function(message) {
// 	var parsedMessage = JSON.parse(message.data);
// 	console.info('Received message: ' + message.data);
//
// 	switch (parsedMessage.id) {
// 	case 'presenterResponse':
// 		presenterResponse(parsedMessage);
// 		break;
// 	case 'viewerResponse':
// 		viewerResponse(parsedMessage);
// 		break;
// 	case 'iceCandidate':
// 		screenPeer.addIceCandidate(parsedMessage.candidate, function(error) {
// 			if (error)
// 				return console.error('Error adding candidate: ' + error);
// 		});
// 		break;
// 	case 'stopCommunication':
// 		dispose();
// 		break;
// 	default:
// 		console.error('Unrecognized message', parsedMessage);
// 	}
// }

function presenterResponse(message) {
	if (message.response != 'accepted') {
		var errorMsg = message.message ? message.message : 'Unknow error';
		console.info('Call not accepted for the following reason: ' + errorMsg);
		dispose();
	} else {
		screenPeer.processAnswer(message.sdpAnswer, function(error) {
			if (error)
				return console.error(error);
		});
	}
}

function viewerResponse(message) {
	if (message.response != 'accepted') {
		var errorMsg = message.message ? message.message : 'Unknow error';
		console.info('Call not accepted for the following reason: ' + errorMsg);
		dispose();
	} else {
		screenPeer.processAnswer(message.sdpAnswer, function(error) {
			if (error)
				return console.error(error);
		});
	}
}

function presenter() {
	if (!screenPeer) {
		showSpinner(screenVideo);
		initiateScreenSharing();

		enableStopButton();
	}
}

function initiateScreenSharing() {
	getScreenId(function (error, sourceId, screen_constraints) {
		console.log("screen_constraints: ");
		if (!screen_constraints) {
			hideSpinner(screenVideo);
			disableStopButton();
			return;
		}
		console.log(screen_constraints);
		navigator.getUserMedia = navigator.mozGetUserMedia || navigator.webkitGetUserMedia;
		navigator.getUserMedia(screen_constraints, function (stream) {
			console.log(stream);

			var constraints = {
				audio: false,
				video: {
					frameRate: {
						min: 1, ideal: 15, max: 30
					},
					width: {
						min: 32, ideal: 50, max: 320
					},
					height: {
						min: 32, ideal: 50, max: 320
					}
				}
			};

			var options = {
				localVideo: screenVideo,
				videoStream: stream,
				mediaConstraints: constraints,
				onicecandidate: onIceCandidate,
				sendSource: 'screen'
			};

			screenPeer = new kurentoUtils.WebRtcPeer.WebRtcPeerSendrecv(options, function (error) {
				if (error) {
					return console.error(error);
				}
				screenPeer.generateOffer(onOfferPresenter);
			});

		}, function (error) {
			console.error(error);
		});
	});
}

function onOfferPresenter(error, offerSdp) {
	if (error)
		return console.error('Error generating the offer');
	console.info('Invoking SDP offer callback function ' + location.host);
	var message = {
		id : 'presenter',
		sdpOffer : offerSdp
	}
	sendMessage(message);
}

function viewer() {
	if (!screenPeer) {
		showSpinner(screenVideo);

		var options = {
			remoteVideo : screenVideo,
			onicecandidate : onIceCandidate,
			sendSource: 'screen'
		}
		screenPeer = new kurentoUtils.WebRtcPeer.WebRtcPeerRecvonly(options,
				function(error) {
					if (error) {
						return console.error(error);
					}
					this.generateOffer(onOfferViewer);
				});

		enableStopButton();
	}
}

function onOfferViewer(error, offerSdp) {
	if (error)
		return console.error('Error generating the offer');
	console.info('Invoking SDP offer callback function ' + location.host);
	var message = {
		id : 'viewer',
		sdpOffer : offerSdp
	}
	sendMessage(message);
}

function onIceCandidate(candidate) {
	console.log("Local candidate" + JSON.stringify(candidate));

	var message = {
		id : 'onIceCandidate',
		candidate : candidate
	};
	sendMessage(message);
}

function stop() {
	var message = {
		id : 'stop'
	}
	sendMessage(message);
	dispose();
}

function dispose() {
	if (screenPeer) {
		screenPeer.dispose();
		screenPeer = null;
	}
	hideSpinner(screenVideo);

	disableStopButton();
}

function disableStopButton() {
	enableButton('#presenter', 'presenter()');
	enableButton('#viewer', 'viewer()');
	disableButton('#stop');
}

function enableStopButton() {
	disableButton('#presenter');
	disableButton('#viewer');
	enableButton('#stop', 'stop()');
}

function disableButton(id) {
	$(id).attr('disabled', true);
	$(id).removeAttr('onclick');
}

function enableButton(id, functionName) {
	$(id).attr('disabled', false);
	$(id).attr('onclick', functionName);
}

function sendMessage(message) {
	var jsonMessage = JSON.stringify(message);
	console.log('Sending message: ' + jsonMessage);
	// ws.send(jsonMessage);
	ws.clientPromise
		.then( wsClient =>{wsClient.send(jsonMessage)})
		.catch( error => alert(error) )
}

function showSpinner() {
	for (var i = 0; i < arguments.length; i++) {
		arguments[i].poster = '/img/transparent-1px.png';
		arguments[i].style.background = 'center transparent url("/img/spinner.gif") no-repeat';
	}
}

function hideSpinner() {
	for (var i = 0; i < arguments.length; i++) {
		arguments[i].src = '';
		arguments[i].poster = '/img/webrtc.png';
		arguments[i].style.background = '';
	}
}

/**
 * Lightbox utility (to display media pipeline image in a modal dialog)
 */
$(document).delegate('*[data-toggle="lightbox"]', 'click', function(event) {
	event.preventDefault();
	$(this).ekkoLightbox();
});

