
import * as VecMath from "./vecmath.js";
import * as Tangram from "./tangram.js";

const ORIGIN_SCALE = 1.2;
const CORNER_PICK_RADIUS = 0.08;
const CORNER_PICK_RADIUS_SQUARED = CORNER_PICK_RADIUS * CORNER_PICK_RADIUS;
const ROTATION_ANGLE_STEP = 15.0;
const REPEAT_EDGE_ANGLE = 45.0;
const STANDARD_ANGLE_EPS = 1e-6;
const DRAG_DISTANCE_MIN = 0.02;
const DRAG_DISTANCE_SQUARED_MIN = DRAG_DISTANCE_MIN * DRAG_DISTANCE_MIN;
const ZOOM_FACTOR = 0.5;
const ZOOM_MIN = 0.75;
const ZOOM_MAX = 1.5;

export const STATE_NONE = 0;
export const STATE_REVIEW = 1;
export const STATE_SELECT = 2;
export const STATE_ASSEMBLE = 3;

export class Puzzle {
	constructor(dissection, transforms, backgroundColor, foregroundColors) {
		this.actualTangram = new Tangram.Tangram(dissection);
		this.finalTangram = Tangram.createShape(dissection, transforms);
		this.backgroundColor = backgroundColor;
		this.foregroundColors = foregroundColors;

		this.state = STATE_NONE;
		this.prevState = STATE_NONE;
		this.zoom = 1.0;
		this.dragging = false;
		this.rotating = false;
		this.selectedTan = null;
		this.pickedTan = null;
		this.pickedPoint = new VecMath.Vector();
		this.draggedPoint = new VecMath.Vector();
		this.pickedVector = new VecMath.Vector();
		this.draggedVector = new VecMath.Vector();
		this.pickedAngle = 0.0;
		this.draggedAngle = 0.0;
		this.pickedRotation = 0.0;
		this.position = new VecMath.Vector();
		this.translation = new VecMath.Vector();

		this.centerTangram(this.finalTangram);
		for (var i = 0; i < this.actualTangram.tans.length; i++) {
			var tan = this.actualTangram.tans[i];
			this.resetTan(tan);
		}
		this.showSelection();
		this.showReview();
	}

	showReview() {
		if (this.state == STATE_REVIEW) {
			return;
		}
		this.prevState = this.state;
		this.state = STATE_REVIEW;
	}

	showGame() {
		this.state = this.prevState;
	}

	showSelection() {
		this.state = STATE_SELECT;
	}

	hideSelection() {
		this.state = STATE_ASSEMBLE;
	}

	setZoom(zoom) {
		this.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom));
	}

	resetTan(tan) {
		this.position.copy(tan.origin).multiplyScalar(ORIGIN_SCALE).add(this.translation);
		tan.active = false;
		tan.transform(this.position, 0.0);
	}

	selectTan(tan) {
		tan.active = true;
		if (!this.actualTangram.placeTan(tan, tan.position, tan.rotation)) {
			tan.active = false;
		} else {
			this.actualTangram.snapTan(tan);
		}
		this.hideSelection();
	}

	actionDown(x, y) {
		this.dragging = false;
		this.rotating = false;
		this.pickedPoint.set(x, y);
		switch (this.state) {
			case STATE_REVIEW:
				this.pickedTan = null;
				break;
			case STATE_SELECT:
			case STATE_ASSEMBLE:
				this.pickTan();
				if (this.pickedTan) {
					this.selectedTan = this.pickedTan;
				}
				break;
		}
	}

	actionMove(x, y) {
		this.draggedPoint.set(x, y);
		if (!this.dragging) {
			if (this.draggedPoint.distanceToSquared(this.pickedPoint) > DRAG_DISTANCE_SQUARED_MIN) {
				if ((this.state == STATE_SELECT) && this.pickedTan) {
					this.selectTan(this.pickedTan);
				}
				if (this.rotating) {
					this.pickedVector.copy(this.pickedPoint).sub(this.pickedTan.position);
					this.pickedAngle = this.pickedVector.angle();
					this.pickedRotation = this.pickedTan.rotation;
				} else {
					this.pickedPoint.copy(this.draggedPoint);
				}
				this.dragging = true;
			}
			return;
		}
		if (this.pickedTan) {
			switch (this.state) {
				case STATE_ASSEMBLE:
					this.dragTan();
					break;
			}
		} else {
			switch (this.state) {
				case STATE_REVIEW:
					this.dragZoom();
					break;
				case STATE_SELECT:
				case STATE_ASSEMBLE:
					this.dragTangram(this.actualTangram);
					this.translation.add(this.draggedVector);
					break;
			}
		}
	}

	actionUp(x, y) {
		if (!this.dragging) {
			switch (this.state) {
				case STATE_SELECT:
					if (this.pickedTan) {
						this.selectTan(this.pickedTan);
					} else if (this.hasAnyTanWithActivity(true)) {
						this.hideSelection();
					}
					break;
				case STATE_ASSEMBLE:
					if (!this.pickedTan) {
						if (this.selectedTan && !this.selectedTan.active) {
							this.resetTan(this.selectedTan);
							this.selectedTan = null;
						} else if (this.hasAnyTanWithActivity(false)) {
							this.showSelection();
						}
					}
					break;
			}
		}
		this.releaseTan();
	}

	hasAnyTanWithActivity(active) {
		for (var i = 0; i < this.actualTangram.tans.length; i++) {
			var tan = this.actualTangram.tans[i];
			if (tan.active == active) {
				return true;
			}
		}
		return false;
	}

	pickTan() {
		if (this.pickedTan = this.pickTanFace()) {
			this.rotating = this.intersectTanCorner();
		} else if (this.pickedTan = this.pickTanCorner()) {
			this.rotating = true;
		}
	}

	isTanPickable(tan) {
		switch (this.state) {
			case STATE_SELECT:
				return !tan.active;
			case STATE_ASSEMBLE:
				return ((!this.selectedTan || this.selectedTan.active) && tan.active)
						|| (tan == this.selectedTan);
		}
		return false;
	}

	pickTanFace() {
		for (var i = 0; i < this.actualTangram.tans.length; i++) {
			var tan = this.actualTangram.tans[i];
			if (this.isTanPickable(tan) && tan.isPointInside(this.pickedPoint)) {
				return tan;
			}
		}
		return null;
	}

	pickTanCorner() {
		var closestTan;
		var closestDistanceSquared;
		for (var i = 0; i < this.actualTangram.tans.length; i++) {
			var tan = this.actualTangram.tans[i];
			if (!this.isTanPickable(tan)) {
				continue;
			}
			for (var j = 0; j < tan.points.length; j++) {
				if (tan.cornerSmooths[j]) {
					continue;
				}
				var point = tan.points[j];
				var distanceSquared = point.distanceToSquared(this.pickedPoint);
				if ((distanceSquared < CORNER_PICK_RADIUS_SQUARED)
						&& ((closestDistanceSquared === undefined)
						|| (distanceSquared < closestDistanceSquared))) {
					closestTan = tan;
					closestDistanceSquared = distanceSquared;
					break;
				}
			}
		}
		if (closestTan === undefined) {
			return null;
		}
		return closestTan;
	}

	intersectTanCorner() {
		for (var i = 0; i < this.pickedTan.points.length; i++) {
			if (this.pickedTan.cornerSmooths[i]) {
				continue;
			}
			var point = this.pickedTan.points[i];
			var distanceSquared = point.distanceToSquared(this.pickedPoint);
			if (distanceSquared < CORNER_PICK_RADIUS_SQUARED) {
				return true;
			}
		}
		return false;
	}

	dragTan() {
		if (!this.pickedTan) {
			return;
		}
		if (this.rotating) {
			this.draggedVector.copy(this.draggedPoint).sub(this.pickedTan.position);
			this.draggedAngle = this.draggedVector.angle();
			var angle = this.pickedRotation + (this.draggedAngle - this.pickedAngle) / Math.PI * 180.0;
			var snapAngle = VecMath.snapPeriodicAngle(angle, ROTATION_ANGLE_STEP);
			for (var i = 0; i < this.pickedTan.edgeAngles.length; i++) {
				if (this.pickedTan.edgeSmooths[i]) {
					continue;
				}
				var edgeAngle = this.pickedTan.edgeAngles[i];
				if (Math.abs(edgeAngle % ROTATION_ANGLE_STEP) > STANDARD_ANGLE_EPS) {
					var edgeSnapAngle = VecMath.snapAngle(angle, -edgeAngle, REPEAT_EDGE_ANGLE);
					if (Math.abs(edgeSnapAngle) < Math.abs(snapAngle)) {
						snapAngle = edgeSnapAngle;
					}
				}
			}
			var rotation = angle + snapAngle;
			if (rotation != this.pickedTan.rotation) {
				this.pickedTan.transform(this.pickedTan.position, rotation);
				this.pickedTan.active = !this.actualTangram.hasCollisions(this.pickedTan);
			}
		} else {
			this.position.copy(this.pickedTan.position).add(this.draggedPoint).sub(this.pickedPoint);
			this.pickedPoint.copy(this.draggedPoint);
			if (this.actualTangram.placeTan(this.pickedTan, this.position, this.pickedTan.rotation)) {
				this.pickedTan.active = true;
				this.actualTangram.snapTan(this.pickedTan);
				this.pickedPoint.add(this.pickedTan.position).sub(this.position);
			} else {
				this.pickedTan.active = false;
				this.pickedTan.transform(this.position, this.pickedTan.rotation);
			}
		}
	}

	dragTangram(tangram) {
		this.draggedVector.copy(this.draggedPoint).sub(this.pickedPoint);
		this.pickedPoint.copy(this.draggedPoint);
		for (var i = 0; i < tangram.tans.length; i++) {
			var tan = tangram.tans[i];
			this.position.copy(tan.position).add(this.draggedVector);
			tan.transform(this.position, tan.rotation);
		}
	}

	dragZoom() {
		this.draggedVector.copy(this.draggedPoint).sub(this.pickedPoint);
		this.pickedPoint.copy(this.draggedPoint);
		this.setZoom(this.zoom - ZOOM_FACTOR * this.draggedVector.y);
	}

	centerTangram(tangram) {
		var aabb = tangram.computeAABB();
		var dx = -0.5 * (aabb.min.x + aabb.max.x);
		var dy = -0.5 * (aabb.min.y + aabb.max.y);
		for (var i = 0; i < tangram.tans.length; i++) {
			var tan = tangram.tans[i];
			this.position.set(dx, dy).add(tan.position);
			tan.transform(this.position, tan.rotation);
		}
	}

	releaseTan() {
		this.pickedTan = null;
	}

	isShapeFull() {
		return this.actualTangram.isShapeFull();
	}

	encodeSnapshot() {
		return this.actualTangram.encodeSnapshot(this.backgroundColor, this.foregroundColors);
	}
}
