
import * as Tangram from "./tangram.js";
import * as Puzzle from "./puzzle.js";
import * as THREE from "./three.js";

const SERVER_URL = location.protocol + "//" + location.host + location.pathname;

const CAMERA_FOV = 70.0;
const CAMERA_NEAR = 0.1;
const CAMERA_FAR = 10.0;
const CAMERA_HEIGHT_MIN = 1.0;
const CAMERA_HEIGHT_MAX = 3.0;

const GROUND_VIEW_DIMENSION = 1.8;

const TAN_DEPTH = 0.1;
const INACTIVE_TAN_HEIGHT = 0.2;
const SELECTION_TAN_HEIGHT = 0.4;

const EXTRUDE_SETTINGS = {
	depth: TAN_DEPTH,
	bevelEnabled: false,
	bevelSegments: 1,
	bevelSize: 0.01,
	bevelThickness: 0.01
};

const MONOCHROME_FOREGROUND_COLORS = [ new Tangram.Color(0x29, 0xab, 0xe2) ];

const BUTTON_WIDTH = 48;
const BUTTON_HEIGHT = 42;

const ALIGN_LEFT = 0x01;
const ALIGN_RIGHT = 0x02;
const ALIGN_HCENTER = 0x04;
const ALIGN_TOP = 0x10;
const ALIGN_BOTTOM = 0x20;
const ALIGN_VCENTER = 0x40;

class Button {
	constructor(element, width, height, alignment, background) {
		this.element = element;
		this.width = width;
		this.height = height;
		this.alignment = alignment;
		this.background = background;
	}

	setMarginTop(marginTop) { this.marginTop = marginTop; }
	setMarginBottom(marginBottom) { this.marginBottom = marginBottom; }
	setMarginRight(marginRight) { this.marginRight = marginRight; }
	setMarginLeft(marginLeft) { this.marginLeft = marginLeft; }
}

var container, camera, scene, renderer, actualGroup, finalGroup;
var raycaster, touchPlane, touchPoint, intersection, pressed;
var puzzle, assembleButton, reviewButton, moreButton, shareButton;
var nextButton, prevButton, yesButton, noButton;
var choosingShape;

init();
animate();

function init() {
	camera = new THREE.PerspectiveCamera(CAMERA_FOV, getAspectRatio(), CAMERA_NEAR, CAMERA_FAR);

	scene = new THREE.Scene();
	scene.background = new THREE.Color(0.5, 0.5, 0.5);

	var ambient = new THREE.AmbientLight(0xffffff, 0.4);
	scene.add(ambient);

	var light = new THREE.DirectionalLight(0xffffff, 0.6);
	light.position.set(-0.4, 0.6, 1.0);
	light.castShadow = true;
	light.shadow.camera.left = -2.0;
	light.shadow.camera.right = 2.0;
	light.shadow.camera.top = 2.0;
	light.shadow.camera.bottom = -2.0;
	light.shadow.camera.near = 0.1;
	light.shadow.camera.far = 2.0;
	light.shadow.mapSize.width = 2048;
	light.shadow.mapSize.height = 2048;
	scene.add(light);

	var dissection = new Tangram.Dissection(SNAPSHOT["dissection"]["id"],
			SNAPSHOT["dissection"]["vertices"], SNAPSHOT["dissection"]["polygons"]);
	var transforms = new Tangram.Transforms(SNAPSHOT["transforms"]).transforms;
	var backgroundColor = new Tangram.Color(SNAPSHOT["backgroundColor"][0],
			SNAPSHOT["backgroundColor"][1], SNAPSHOT["backgroundColor"][2]);
	var foregroundColors = new Tangram.Colors(SNAPSHOT["foregroundColors"]).colors;

	var urlEncodedSnapshot = getUrlParameter("t");
	if (urlEncodedSnapshot) {
		try {
			var snapshot = Tangram.decodeSnapshot(urlEncodedSnapshot, dissection);
			transforms = snapshot.transforms;
			backgroundColor = snapshot.backgroundColor;
			foregroundColors = snapshot.foregroundColors;
		} catch (error) {
			console.error("Failed to decode snapshot", error);
		}
	}

	puzzle = new Puzzle.Puzzle(dissection, transforms, backgroundColor, foregroundColors);

	var paramZoom = getUrlParameter("zoom");
	if (paramZoom) {
		puzzle.setZoom(Number.parseFloat(paramZoom));
	}
	updateCameraHeight();

	actualGroup = createTangramView(puzzle.actualTangram, foregroundColors, true);
	scene.add(actualGroup);

	updateTanHeights(puzzle.actualTangram);

	var paramHint = getUrlParameter("hint");
	var hint = (paramHint && Number.parseInt(paramHint));
	finalGroup = createTangramView(puzzle.finalTangram, (hint) ? foregroundColors
			: MONOCHROME_FOREGROUND_COLORS, false);
	finalGroup.visible = true;
	scene.add(finalGroup);

	var groundGeometry = new THREE.PlaneBufferGeometry(10.0, 10.0, 1, 1);
	var groundMesh = new THREE.Mesh(groundGeometry, new THREE.MeshPhongMaterial(
			{ color: new THREE.Color(backgroundColor.r / 255.0,
			backgroundColor.g / 255.0, backgroundColor.b / 255.0) }));
	groundMesh.receiveShadow = true;
	scene.add(groundMesh);

	raycaster = new THREE.Raycaster();
	touchPlane = new THREE.Plane(new THREE.Vector3(0.0, 0.0, 1.0), 0.0);
	touchPoint = new THREE.Vector2();
	intersection = new THREE.Vector3();
	choosingShape = false;

	container = document.getElementById("container");

	renderer = new THREE.WebGLRenderer({ antialias: false });
	renderer.setPixelRatio(window.devicePixelRatio);
	renderer.setSize(window.innerWidth, window.innerHeight);
	renderer.shadowMap.enabled = true;
	renderer.shadowMap.type = THREE.PCFSoftShadowMap;
	container.appendChild(renderer.domElement);

	assembleButton = createButton(ALIGN_RIGHT | ALIGN_BOTTOM, "assemble", assembleShape);
	reviewButton = createButton(ALIGN_RIGHT | ALIGN_BOTTOM, "review", reviewShape);
	moreButton = createButton(ALIGN_LEFT | ALIGN_BOTTOM, "more", showMoreShapes);
	shareButton = createButton(ALIGN_HCENTER | ALIGN_BOTTOM, "share", shareShape);
	nextButton = createButton(ALIGN_RIGHT | ALIGN_BOTTOM, "next", nextShape);
	prevButton = createButton(ALIGN_LEFT | ALIGN_BOTTOM, "prev", prevShape);
	yesButton = createButton(ALIGN_HCENTER | ALIGN_BOTTOM, "yes", playShape);
	noButton = createButton(ALIGN_HCENTER | ALIGN_BOTTOM, "no", cancelShape);
	yesButton.setMarginLeft(-BUTTON_WIDTH / 2);
	noButton.setMarginLeft(BUTTON_WIDTH / 2);

	updateGui();

	window.addEventListener("resize", onWindowResize, false);

	renderer.domElement.addEventListener("mousedown", onDocumentMouseDown, false);
	renderer.domElement.addEventListener("mousemove", onDocumentMouseMove, false);
	renderer.domElement.addEventListener("mouseup", onDocumentMouseUp, false);
	renderer.domElement.addEventListener("touchstart", onDocumentTouchStart, false);
	renderer.domElement.addEventListener("touchmove", onDocumentTouchMove, false);
	renderer.domElement.addEventListener("touchend", onDocumentTouchEnd, false);
}

function getUrlParameter(name) {
	var param = new RegExp("[?&]" + name + "=([^&]*)").exec(location.search);
	return (param) ? param[1] : null;
}

function getAspectRatio() {
	return window.innerWidth / window.innerHeight;
}

function updateCameraHeight() {
	var height = GROUND_VIEW_DIMENSION / Math.tan(CAMERA_FOV);
	if (camera.aspect < 1.0) {
		height /= camera.aspect;
	}
	camera.position.z = Math.max(CAMERA_HEIGHT_MIN, Math.min(CAMERA_HEIGHT_MAX, height))
			/ puzzle.zoom;
}

function onWindowResize() {
	camera.aspect = getAspectRatio();
	updateCameraHeight();

	camera.updateProjectionMatrix();
	renderer.setSize(window.innerWidth, window.innerHeight);

	renderFrame();
}

function createTangramView(tangram, foregroundColors, receiveShadow) {
	var group = new THREE.Group();
	group.visible = false;

	for (var i = 0; i < tangram.tans.length; i++) {
		var tan = tangram.tans[i];
		var color = foregroundColors[i % foregroundColors.length];

		var points = new Array(tan.corners.length + 1);
		for (var j = 0; j <= tan.corners.length; j++) {
			var corner = tan.corners[(j < tan.corners.length) ? j : 0];
			points[j] = new THREE.Vector2(corner.x, corner.y);
		}

		var shape = new THREE.Shape(points);
		var geometry = new THREE.ExtrudeBufferGeometry(shape, EXTRUDE_SETTINGS);
		var mesh = new THREE.Mesh(geometry, new THREE.MeshPhongMaterial(
				{ color: new THREE.Color(color.r / 255.0, color.g / 255.0, color.b / 255.0) }));
		mesh.castShadow = true;
		mesh.receiveShadow = receiveShadow;
		group.add(mesh);

		tan.userData.mesh = mesh;
		syncTanTransform(tan);
	}

	return group;
}

function syncTanTransforms(tangram) {
	for (var i = 0; i < tangram.tans.length; i++) {
		var tan = tangram.tans[i];
		syncTanTransform(tan);
	}
}

function syncTanTransform(tan) {
	var mesh = tan.userData.mesh;
	mesh.position.x = tan.position.x;
	mesh.position.y = tan.position.y;
	mesh.rotation.z = tan.rotation / 180.0 * Math.PI;
}

function renderFrame() {
	requestAnimationFrame(animate);
}

function animate() {
	renderer.render(scene, camera);
}

function createButton(alignment, background, onclick) {
	var element = document.createElement("button");
	element.onclick = onclick;
	container.appendChild(element);
	return new Button(element, BUTTON_WIDTH, BUTTON_HEIGHT, alignment, background);
}

function setButtonVisible(button, visible) {
	if (visible) {
		var alignment = "";
		if (button.alignment & ALIGN_LEFT) {
			alignment += " left: 0;";
		} else if (button.alignment & ALIGN_HCENTER) {
			alignment += " left: 50%;";
		} else if (button.alignment & ALIGN_RIGHT) {
			alignment += " right: 0;";
		}
		if (button.alignment & ALIGN_TOP) {
			alignment += " top: 0;";
		} else if (button.alignment & ALIGN_VCENTER) {
			alignment += " top: 50%;";
		} else if (button.alignment & ALIGN_BOTTOM) {
			alignment += " bottom: 0;";
		}
		if ((button.alignment & ALIGN_HCENTER) && (button.alignment & ALIGN_VCENTER)) {
			alignment += " transform: translate(-50%, -50%);";
		} else if (button.alignment & ALIGN_HCENTER) {
			alignment += " transform: translate(-50%, 0);";
		} else if (button.alignment & ALIGN_VCENTER) {
			alignment += " transform: translate(0, -50%);";
		}
		var margin = "";
		if (button.marginTop !== undefined) {
			margin += " margin-top: " + button.marginTop + "px;"
		}
		if (button.marginBottom !== undefined) {
			margin += " margin-bottom: " + button.marginBottom + "px;"
		}
		if (button.marginRight !== undefined) {
			margin += " margin-right: " + button.marginRight + "px;"
		}
		if (button.marginLeft !== undefined) {
			margin += " margin-left: " + button.marginLeft + "px;"
		}
		button.element.style = "position: fixed;" + alignment + margin
				+ " width: " + button.width + "px; height: " + button.height
				+ "px; border: none; background: url(res/"
				+ button.background + ".svg) no-repeat;";
	} else {
		button.element.style = "display: none;";
	}
}

function updateGui() {
	var assembleButtonVisible = false;
	var reviewButtonVisible = false;
	var moreButtonVisible = false;
	var shareButtonVisible = false;
	var nextButtonVisible = false;
	var prevButtonVisible = false;
	var yesButtonVisible = false;
	var noButtonVisible = false;

	if (choosingShape) {
		nextButtonVisible = true;
		prevButtonVisible = true;
		yesButtonVisible = true;
		noButtonVisible = true;
	} else {
		assembleButtonVisible = (puzzle.state == Puzzle.STATE_REVIEW);
		if ((puzzle.state == Puzzle.STATE_SELECT)
				|| (puzzle.state == Puzzle.STATE_ASSEMBLE)) {
			reviewButtonVisible = true;
			//moreButtonVisible = true;
		}
		shareButtonVisible = (puzzle.state == Puzzle.STATE_ASSEMBLE)
				&& puzzle.isShapeFull();
	}

	setButtonVisible(assembleButton, assembleButtonVisible);
	setButtonVisible(reviewButton, reviewButtonVisible);
	setButtonVisible(moreButton, moreButtonVisible);
	setButtonVisible(shareButton, shareButtonVisible);
	setButtonVisible(nextButton, nextButtonVisible);
	setButtonVisible(prevButton, prevButtonVisible);
	setButtonVisible(yesButton, yesButtonVisible);
	setButtonVisible(noButton, noButtonVisible);
}

function shareShape() {
	var urlEncodedSnapshot = puzzle.encodeSnapshot();

	var shareUrl = SERVER_URL + "?t=" + urlEncodedSnapshot;
	if (navigator.share) {
		navigator.share({
			url: shareUrl
		});
	} else {
		navigator.clipboard.writeText(shareUrl)
				.then(() => {
					alert("Share URL copied to clipboard");
				})
				.catch(err => {
					alert("Could not copy share URL: " + err);
				});
	}
}

function assembleShape() {
	var prevState = puzzle.state;
	puzzle.showGame();
	handleStateChanged(prevState);
}

function reviewShape() {
	var prevState = puzzle.state;
	puzzle.showReview();
	handleStateChanged(prevState);
}

function showMoreShapes() {
	var shapesRequest = new XMLHttpRequest();
	shapesRequest.open("POST", SERVER_URL + "/shapes", false);
	shapesRequest.setRequestHeader("Content-Type", "application/json");

	var shapesIn = {};
	shapesIn["dissectionId"] = puzzle.actualTangram.dissection.id;
	shapesIn["cursor"] = null;
	shapesRequest.send(JSON.stringify(shapesIn));

	if (shapesRequest.status != 200) {
		alert("Failed to retrieve shapes");
		return;
	}

	var shapesOut = JSON.parse(shapesRequest.responseText);

	// TODO showMoreShapes

	choosingShape = true;
	updateGui();
}

function nextShape() {
	// TODO nextShape
	updateGui();
}

function prevShape() {
	// TODO prevShape
	updateGui();
}

function playShape() {
	// TODO playShape
	choosingShape = false;
	updateGui();
}

function cancelShape() {
	// TODO cancelShape
	choosingShape = false;
	updateGui();
}

function intersectTouchPlane(clientX, clientY) {
	var rect = renderer.domElement.getBoundingClientRect();

	touchPoint.x = ((clientX - rect.left) / rect.width) * 2.0 - 1.0;
	touchPoint.y = -((clientY - rect.top) / rect.height) * 2.0 + 1.0;

	raycaster.setFromCamera(touchPoint, camera);

	return raycaster.ray.intersectPlane(touchPlane, intersection);
}

function setTouchPlaneHeight(height) {
	touchPlane.constant = -height;
}

function updateTouchPlaneHeight() {
	var planeHeight = TAN_DEPTH;
	switch (puzzle.state) {
		case Puzzle.STATE_SELECT:
			planeHeight += SELECTION_TAN_HEIGHT;
			break;
		case Puzzle.STATE_ASSEMBLE:
			if (puzzle.selectedTan && !puzzle.selectedTan.active) {
				planeHeight += INACTIVE_TAN_HEIGHT;
			}
			break;
	}
	setTouchPlaneHeight(planeHeight);
}

function setTanHeight(tan, height) {
	var mesh = tan.userData.mesh;
	mesh.position.z = height;
}

function updateTanHeights(tangram) {
	for (var i = 0; i < tangram.tans.length; i++) {
		var tan = tangram.tans[i];
		updateTanHeight(tan);
	}
}

function updateTanHeight(tan) {
	var tanHeight = 0.0;
	if (!tan.active) {
		if ((puzzle.state == Puzzle.STATE_ASSEMBLE)
				&& (tan == puzzle.selectedTan)) {
			tanHeight = INACTIVE_TAN_HEIGHT;
		} else {
			tanHeight = SELECTION_TAN_HEIGHT;
		}
	}
	setTanHeight(tan, tanHeight);
}

function setTanVisibility(tan, visible) {
	var mesh = tan.userData.mesh;
	mesh.visible = visible;
}

function setSelectionTansVisibility(visible) {
	for (var i = 0; i < puzzle.actualTangram.tans.length; i++) {
		var tan = puzzle.actualTangram.tans[i];
		if (!tan.active && (visible || (tan != puzzle.selectedTan))) {
			setTanVisibility(tan, visible);
		}
	}
}

function onActionDown(clientX, clientY) {
	if (choosingShape) {
		return;
	}

	pressed = false;

	updateTouchPlaneHeight();
	if (intersectTouchPlane(clientX, clientY)) {
		puzzle.actionDown(intersection.x, intersection.y);

		setTouchPlaneHeight((puzzle.pickedTan) ? TAN_DEPTH : 0.0);
		if (intersectTouchPlane(clientX, clientY)) {
			puzzle.pickedPoint.set(intersection.x, intersection.y);
			pressed = true;
		}
	}
}

function onActionMove(clientX, clientY) {
	if (!pressed || choosingShape) {
		return;
	}

	var prevState = puzzle.state;
	var prevZoom = puzzle.zoom;

	if (intersectTouchPlane(clientX, clientY)) {
		puzzle.actionMove(intersection.x, intersection.y);

		if (puzzle.pickedTan) {
			syncTanTransform(puzzle.pickedTan);
			updateTanHeight(puzzle.pickedTan);
		} else {
			if (puzzle.state == Puzzle.STATE_REVIEW) {
				syncTanTransforms(puzzle.finalTangram);
			} else {
				syncTanTransforms(puzzle.actualTangram);
			}
		}

		renderFrame();
	}

	if (prevState != puzzle.state) {
		handleStateChanged(prevState);
	}

	if (prevZoom != puzzle.zoom) {
		updateCameraHeight();
	}
}

function onActionUp(clientX, clientY) {
	if (!pressed || choosingShape) {
		return;
	}

	pressed = false;

	var prevState = puzzle.state;
	var prevSelectedTan = puzzle.selectedTan;

	intersectTouchPlane(clientX, clientY);
	puzzle.actionUp(intersection.x, intersection.y);

	if (prevState != puzzle.state) {
		handleStateChanged(prevState);
	} else {
		if (puzzle.state == Puzzle.STATE_ASSEMBLE) {
			updateGui();

			if (!puzzle.selectedTan && prevSelectedTan) {
				syncTanTransform(prevSelectedTan);
				setTanHeight(prevSelectedTan, SELECTION_TAN_HEIGHT);
				setTanVisibility(prevSelectedTan, false);

				renderFrame();
			}
		}
	}
}

function handleStateChanged(prevState) {
	if (puzzle.state == Puzzle.STATE_REVIEW) {
		actualGroup.visible = false;
		finalGroup.visible = true;
	} else if (prevState == Puzzle.STATE_REVIEW) {
		actualGroup.visible = true;
		finalGroup.visible = false;
	}

	if (puzzle.state == Puzzle.STATE_SELECT) {
		setSelectionTansVisibility(true);
	} else if (prevState == Puzzle.STATE_SELECT) {
		setSelectionTansVisibility(false);
	}

	if (puzzle.selectedTan) {
		syncTanTransform(puzzle.selectedTan);
		updateTanHeight(puzzle.selectedTan);
	}

	updateGui();
	renderFrame();
}

function onDocumentMouseDown(event) {
	event.preventDefault();

	onActionDown(event.clientX, event.clientY);
}

function onDocumentMouseMove(event) {
	event.preventDefault();

	onActionMove(event.clientX, event.clientY);
}

function onDocumentMouseUp(event) {
	event.preventDefault();

	onActionUp(event.clientX, event.clientY);
}

function onDocumentTouchStart(event) {
	event.preventDefault();
	event = event.changedTouches[0];

	onActionDown(event.clientX, event.clientY);
}

function onDocumentTouchMove(event) {
	event.preventDefault();
	event = event.changedTouches[0];

	onActionMove(event.clientX, event.clientY);
}

function onDocumentTouchEnd(event) {
	event.preventDefault();
	event = event.changedTouches[0];

	onActionUp(event.clientX, event.clientY);
}
