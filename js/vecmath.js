
export class Vector {
	constructor(x = 0.0, y = 0.0) {
		this.x = x;
		this.y = y;
	}

	clone() { return new Vector(this.x, this.y); }
	copy(v) { this.x = v.x; this.y = v.y; return this; }
	set(x, y) { this.x = x; this.y = y; return this; }

	add(v) { this.x += v.x; this.y += v.y; return this; }
	sub(v) { this.x -= v.x; this.y -= v.y; return this; }
	negate(v) { this.x = -this.x; this.y = -this.y; return this; }
	multiplyScalar(scalar) { this.x *= scalar; this.y *= scalar; return this; }
	divideScalar(scalar) { return this.multiplyScalar(1.0 / scalar); }
	dot(v) { return this.x * v.x + this.y * v.y; }
	cross(v) { return this.x * v.y - this.y * v.x; }
	length() { return Math.sqrt(this.x * this.x + this.y * this.y); }
	normalize() { return this.divideScalar(this.length() || 1.0); }
	angle() { return Math.atan2(this.y, this.x); }
	distanceTo(v) { return Math.sqrt(this.distanceToSquared(v)); }
	distanceToSquared(v) {
		var dx = this.x - v.x;
		var dy = this.y - v.y;
		return dx * dx + dy * dy;
	}

	perpendicular() {
		var x = this.x;
		this.x = -this.y;
		this.y = x;
		return this;
	}

	rotate(angle) {
		var sina = Math.sin(angle);
		var cosa = Math.cos(angle);
		var x = this.x * cosa - this.y * sina;
		var y = this.x * sina + this.y * cosa;
		this.x = x;
		this.y = y;
		return this;
	}
}

export function isPolygonClockwise(corners) {
	var sum = 0.0;
	for (var i = 0; i < corners.length; i++) {
		var c1 = corners[i];
		var c2 = corners[(i < corners.length - 1) ? i + 1 : 0];
		sum += (c2.x - c1.x) * (c2.y + c1.y);
	}
	return (sum > 0.0);
}

export function isPolygonConvex(corners) {
	var ccw0;
	for (var i = 0; i < corners.length; i++) {
		var c1 = corners[i];
		var c2 = corners[(i < corners.length - 1) ? i + 1 : 0];
		var c3 = corners[(i < corners.length - 2) ? i + 2 : i - (corners.length - 2)];
		var e1 = c2.clone().sub(c1);
		var e2 = c3.clone().sub(c2);
		var ccw = (e1.cross(e2) <= 0.0);
		if (i > 0) {
			if (ccw != ccw0) {
				return false;
			}
		} else {
			ccw0 = ccw;
		}
	}
	return true;
}

export function projectPolygonToNormal(points, normal) {
	var min;
	var max;
	for (var i = 0; i < points.length; i++) {
		var dot = points[i].dot(normal);
		if ((min === undefined) || (dot < min)) {
			min = dot;
		}
		if ((max === undefined) || (dot > max)) {
			max = dot;
		}
	}
	return { min: min, max: max };
}

export function computePolygonPenetration(points1, points2, normal) {
	var proj1 = projectPolygonToNormal(points1, normal);
	var proj2 = projectPolygonToNormal(points2, normal);
	return proj1.max - proj2.min;
}

export function signedDistanceToEdge(point, edgePoint, edgeNormal) {
	// TODO use temporary vector instead of cloning as optimization
	return edgePoint.clone().sub(point).dot(edgeNormal);
}

export function isPointOnEdge(point, edgePoint1, edgePoint2, edgeTangent, edgeNormal, eps = 1e-7) {
	var distance = Math.abs(signedDistanceToEdge(point, edgePoint1, edgeNormal));
	if (distance > eps) {
		return false;
	}
	var dot = point.dot(edgeTangent);
	var edgeDot1 = edgePoint1.dot(edgeTangent);
	if (dot < edgeDot1 - eps) {
		return false;
	}
	var edgeDot2 = edgePoint2.dot(edgeTangent);
	return (dot <= edgeDot2 + eps);
}

export function isPointInsideConvexPolygon(point, corners, normals, eps = 1e-7) {
	for (var i = 0; i < corners.length; i++) {
		if (signedDistanceToEdge(point, corners[i], normals[i]) + eps < 0.0) {
			return false;
		}
	}
	return true;
}

export function wrapAngle(angle) {
	var wrappedAngle = angle % 360.0;
	if (wrappedAngle > 180.0) {
		return wrappedAngle - 360.0;
	} else if (wrappedAngle < -180.0) {
		return wrappedAngle + 360.0;
	}
	return wrappedAngle;
}

export function snapPeriodicAngle(sourceAngle, periodicAngle) {
	var steps = Math.round(sourceAngle / periodicAngle);
	return steps * periodicAngle - sourceAngle;
}

export function snapAngle(sourceAngle, targetAngle, repeatAngle) {
	var steps = Math.round(360.0 / repeatAngle);
	var closestSnapAngle;
	for (var i = 0; i < steps; i++) {
		var angle = targetAngle + i * repeatAngle;
		var snapAngle = wrapAngle(angle - sourceAngle);
		if ((closestSnapAngle === undefined) || (Math.abs(snapAngle) < Math.abs(closestSnapAngle))) {
			closestSnapAngle = snapAngle;
		}
	}
	return closestSnapAngle;
}
