
import * as Base64 from "./base64.js";
import * as VecMath from "./vecmath.js";

const SMOOTH_EDGE_ANGLE_MAX = 15.0;

export class Tan {
	constructor(vertices, polygon) {
		if (polygon.length < 3) {
			throw new Error("Tan polygon should have at least 3 corners");
		}
		this.origin = new VecMath.Vector();
		for (var i = 0; i < polygon.length; i++) {
			this.origin.x += vertices[polygon[i]][0];
			this.origin.y += vertices[polygon[i]][1];
		}
		this.origin.divideScalar(polygon.length);
		this.corners = new Array(polygon.length);
		for (var i = 0; i < polygon.length; i++) {
			this.corners[i] = new VecMath.Vector(vertices[polygon[i]][0], vertices[polygon[i]][1])
					.sub(this.origin);
		}
		this.edgeAngles = new Array(polygon.length);
		for (var i = 0; i < this.corners.length; i++) {
			var c1 = this.corners[i];
			var c2 = this.corners[(i < this.corners.length - 1) ? i + 1 : 0];
			this.edgeAngles[i] = c2.clone().sub(c1).angle() / Math.PI * 180.0;
		}
		this.cornerSmooths = new Array(polygon.length);
		this.edgeSmooths = new Array(polygon.length);
		for (var i = 0; i < this.corners.length; i++) {
			var e1 = this.edgeAngles[(i == 0) ? this.corners.length - 1 : i - 1];
			var e2 = this.edgeAngles[i];
			var e3 = this.edgeAngles[(i < this.corners.length - 1) ? i + 1 : 0];
			var smooth1 = (Math.abs(VecMath.wrapAngle(e2 - e1)) < SMOOTH_EDGE_ANGLE_MAX);
			var smooth2 = (Math.abs(VecMath.wrapAngle(e3 - e2)) < SMOOTH_EDGE_ANGLE_MAX);
			this.cornerSmooths[i] = smooth1;
			this.edgeSmooths[i] = smooth1 || smooth2;
		}

		if (!VecMath.isPolygonClockwise(this.corners)) {
			throw new Error("Tan polygon should be clockwise");
		}
		if (!VecMath.isPolygonConvex(this.corners)) {
			throw new Error("Tan polygon should be convex");
		}

		this.points = new Array(polygon.length);
		this.mids = new Array(polygon.length);
		this.tangents = new Array(polygon.length);
		this.normals = new Array(polygon.length);
		for (var i = 0; i < this.corners.length; i++) {
			this.mids[i] = new VecMath.Vector();
			this.points[i] = new VecMath.Vector();
			this.tangents[i] = new VecMath.Vector();
			this.normals[i] = new VecMath.Vector();
		}
		this.position = new VecMath.Vector();
		this.rotation = 0.0;
		this.active = true;
		this.userData = { };

		this.transform(this.origin, 0.0);
	}

	transform(position, rotation) {
		this.position.copy(position);
		this.rotation = rotation;
		var angle = rotation / 180.0 * Math.PI;
		for (var i = 0; i < this.corners.length; i++) {
			this.points[i].copy(this.corners[i]).rotate(angle).add(position);
		}
		for (var i = 0; i < this.corners.length; i++) {
			var p1 = this.points[i];
			var p2 = this.points[(i < this.corners.length - 1) ? i + 1 : 0];
			this.mids[i].copy(p1).add(p2).multiplyScalar(0.5);
			this.tangents[i].copy(p2).sub(p1).normalize();
			this.normals[i].copy(this.tangents[i]).perpendicular();
		}
	}

	isPointInside(point, eps = 1e-7) {
		return VecMath.isPointInsideConvexPolygon(point, this.points, this.normals, eps);
	}

}

function computeTanCollision(tan1, tan2) {
	var resultNormal = new VecMath.Vector();
	var resultPenetration;
	for (var i = 0; i < tan1.normals.length; i++) {
		var normal = tan1.normals[i];
		var penetration = VecMath.computePolygonPenetration(tan1.points, tan2.points, normal);
		if ((resultPenetration === undefined) || (penetration < resultPenetration)) {
			resultNormal.copy(normal);
			resultPenetration = penetration;
		}
	}
	for (var i = 0; i < tan2.normals.length; i++) {
		var normal = tan2.normals[i];
		var penetration = VecMath.computePolygonPenetration(tan2.points, tan1.points, normal);
		if ((resultPenetration === undefined) || (penetration < resultPenetration)) {
			resultNormal.copy(normal).negate();
			resultPenetration = penetration;
		}
	}
	//if (resultPenetration > 0.0) {
	// TODO check normal between tan positions
	//}
	return { normal: resultNormal, penetration: resultPenetration };
}

function sortCollisions(collisions) {
	collisions.sort((c1, c2) => (c1.penetration < c2.penetration) ? 1
			: ((c1.penetration > c2.penetration) ? -1 : 0));
}

function isPointOnTanEdge(point, tan, eps = 1e-7) {
	for (var i = 0; i < tan.points.length; i++) {
		var edgePoint1 = tan.points[i];
		var edgePoint2 = tan.points[(i < tan.points.length - 1) ? i + 1 : 0];
		if (VecMath.isPointOnEdge(point, edgePoint1, edgePoint2,
				tan.tangents[i], tan.normals[i], eps)) {
			return true;
		}
	}
	return false;
}

function doTansTouch(tan1, tan2, eps = 1e-7) {
	for (var i = 0; i < tan1.points.length; i++) {
		if (isPointOnTanEdge(tan1.points[i], tan2, eps)) {
			return true;
		}
	}
	for (var i = 0; i < tan2.points.length; i++) {
		if (isPointOnTanEdge(tan2.points[i], tan1, eps)) {
			return true;
		}
	}
	return false;
}

function processTanPoints(tan1, tan2, processPoints) {
	for (var i = 0; i < tan1.points.length; i++) {
		var point1 = tan1.points[i];
		for (var j = 0; j < tan2.points.length; j++) {
			var point2 = tan2.points[j];
			processPoints(point1, point2);
		}
	}
}

function processTanPointMid(tan1, tan2, processPointMid) {
	for (var i = 0; i < tan1.points.length; i++) {
		var point1 = tan1.points[i];
		for (var j = 0; j < tan2.mids.length; j++) {
			var mid2 = tan2.mids[j];
			processPointMid(point1, mid2);
		}
	}
}

function processTanMidPoint(tan1, tan2, processMidPoint) {
	for (var i = 0; i < tan1.mids.length; i++) {
		var mid1 = tan1.mids[i];
		for (var j = 0; j < tan2.points.length; j++) {
			var point2 = tan2.points[j];
			processMidPoint(mid1, point2);
		}
	}
}

function processTanMids(tan1, tan2, processMids) {
	for (var i = 0; i < tan1.mids.length; i++) {
		var mid1 = tan1.mids[i];
		for (var j = 0; j < tan2.mids.length; j++) {
			var mid2 = tan2.mids[j];
			processMids(mid1, mid2);
		}
	}
}

function processTanPointEdge(tan1, tan2, processPointEdge) {
	for (var i = 0; i < tan1.points.length; i++) {
		var point1 = tan1.points[i];
		for (var j = 0; j < tan2.points.length; j++) {
			var edgePoint21 = tan2.points[j];
			var edgePoint22 = tan2.points[(j < tan2.points.length - 1) ? j + 1 : 0];
			var edgeTangent2 = tan2.tangents[j];
			var edgeNormal2 = tan2.normals[j];
			processPointEdge(point1, edgePoint21, edgePoint22, edgeTangent2, edgeNormal2);
		}
	}
}

function snapTan(tan, point, snapPoint) {
	tan.transform(tan.position.clone().add(snapPoint).sub(point), tan.rotation);
}

export class Dissection {
	constructor(id, vertices, polygons) {
		this.id = id;
		this.vertices = vertices;
		this.polygons = polygons;
	}
}

export class Color {
	constructor(r, g, b) {
		if ((r < 0x00) || (r > 0xff) || (g < 0x00) || (g > 0xff)
				|| (b < 0x00) || (b > 0xff)) {
			throw new Error("Color components should be in range [0..255]");
		}
		this.r = r;
		this.g = g;
		this.b = b;
	}
}

export class Colors {
	constructor(colors) {
		this.colors = new Array(colors.length);
		for (var i = 0; i < colors.length; i++) {
			var color = colors[i];
			this.colors[i] = new Color(color[0], color[1], color[2]);
		}
	}
}

export class Transform {
	constructor(position, rotation) {
		this.position = position;
		this.rotation = rotation;
	}
}

export class Transforms {
	constructor(transforms) {
		this.transforms = new Array(transforms.length);
		for (var i = 0; i < transforms.length; i++) {
			var transform = transforms[i];
			this.transforms[i] = new Transform(new VecMath.Vector(transform[0], transform[1]), transform[2]);
		}
	}
}

const ENCODER_VERSION = 1;
const ENCODE_POSITION_SCALE = 10000;
const ENCODE_ROTATION_SCALE = 100;
const DECODE_POSITION_SCALE = 1.0 / ENCODE_POSITION_SCALE;
const DECODE_ROTATION_SCALE = 1.0 / ENCODE_ROTATION_SCALE;

export class Snapshot {
	constructor(dissection, transforms, backgroundColor, foregroundColors) {
		this.dissection = dissection;
		this.transforms = transforms;
		this.backgroundColor = backgroundColor;
		this.foregroundColors = foregroundColors;
	}
}

export class Tangram {
	constructor(dissection) {
		this.dissection = dissection;
		this.tans = new Array(dissection.polygons.length);
		for (var i = 0; i < dissection.polygons.length; i++) {
			this.tans[i] = new Tan(dissection.vertices, dissection.polygons[i]);
		}
	}

	processTanWithOtherTans(tan, processTan) {
		for (var i = 0; i < this.tans.length; i++) {
			var otherTan = this.tans[i];
			if (!otherTan.active || (otherTan == tan)) {
				continue;
			}
			if (!processTan(tan, otherTan)) {
				return false;
			}
		}
		return true;
	}

	computeCollisions(tan) {
		var collisions = new Array();
		this.processTanWithOtherTans(tan, function(tan, otherTan) {
			var collision = computeTanCollision(otherTan, tan);
			collisions.push(collision);
			return true;
		});
		sortCollisions(collisions);
		return collisions;
	}

	hasCollisions(tan, eps = 1e-8) {
		var collisions = this.computeCollisions(tan);
		return (collisions.length > 0) && (collisions[0].penetration > eps);
	}

	placeTan(tan, position, rotation, maxPenetration = 0.1, maxIterations = 10, eps = 1e-8) {
		var tanPosition;
		var collisionNormal;
		var prevPosition = tan.position.clone();
		var prevRotation = tan.rotation;
		tan.transform(position, rotation);
		for (var i = 0; i <= maxIterations; i++) {
			var collisions = this.computeCollisions(tan);
			if (collisions.length == 0) {
				break;
			}
			var deepestCollision = collisions[0];
			if (deepestCollision.penetration <= eps) {
				break;
			}
			if ((deepestCollision.penetration > maxPenetration)
					|| (i == maxIterations)) {
				tan.transform(prevPosition, prevRotation);
				return false;
			}
			if (i == 0) {
				tanPosition = position.clone();
				collisionNormal = new VecMath.Vector();
			}
			tanPosition.add(collisionNormal.copy(deepestCollision.normal)
					.multiplyScalar(deepestCollision.penetration));
			tan.transform(tanPosition, rotation);
		}
		return true;
	}

	snapTanPoint(tan, maxDistanceSquared) {
		var tanPoint;
		var snapPoint;
		var closestDistanceSquared;
		this.processTanWithOtherTans(tan, function(tan, otherTan) {
			processTanPoints(tan, otherTan, function(point, otherPoint) {
				var distanceSquared = point.distanceToSquared(otherPoint);
				if (distanceSquared < maxDistanceSquared) {
					if ((closestDistanceSquared === undefined) || (distanceSquared < closestDistanceSquared)) {
						tanPoint = point;
						snapPoint = otherPoint;
						closestDistanceSquared = distanceSquared;
					}
				}
			});
			return true;
		});
		if (closestDistanceSquared === undefined) {
			return false;
		}
		snapTan(tan, tanPoint, snapPoint);
		return true;
	}

	snapTanMid(tan, maxDistanceSquared) {
		var tanPoint;
		var snapPoint;
		var closestDistanceSquared;
		this.processTanWithOtherTans(tan, function(tan, otherTan) {
			processTanPointMid(tan, otherTan, function(point, otherMid) {
				var distanceSquared = point.distanceToSquared(otherMid);
				if (distanceSquared < maxDistanceSquared) {
					if ((closestDistanceSquared === undefined) || (distanceSquared < closestDistanceSquared)) {
						tanPoint = point;
						snapPoint = otherMid;
						closestDistanceSquared = distanceSquared;
					}
				}
			});
			return true;
		});
		this.processTanWithOtherTans(tan, function(tan, otherTan) {
			processTanMidPoint(tan, otherTan, function(mid, otherPoint) {
				var distanceSquared = mid.distanceToSquared(otherPoint);
				if (distanceSquared < maxDistanceSquared) {
					if ((closestDistanceSquared === undefined) || (distanceSquared < closestDistanceSquared)) {
						tanPoint = mid;
						snapPoint = otherPoint;
						closestDistanceSquared = distanceSquared;
					}
				}
			});
			return true;
		});
		this.processTanWithOtherTans(tan, function(tan, otherTan) {
			processTanMids(tan, otherTan, function(mid, otherMid) {
				var distanceSquared = mid.distanceToSquared(otherMid);
				if (distanceSquared < maxDistanceSquared) {
					if ((closestDistanceSquared === undefined) || (distanceSquared < closestDistanceSquared)) {
						tanPoint = mid;
						snapPoint = otherMid;
						closestDistanceSquared = distanceSquared;
					}
				}
			});
			return true;
		});
		if (closestDistanceSquared === undefined) {
			return false;
		}
		snapTan(tan, tanPoint, snapPoint);
		return true;
	}

	snapTanEdge(tan, maxDistance, eps = 1e-9) {
		var tanPoint;
		var snapPoint = new VecMath.Vector();
		var closestDistance;
		this.processTanWithOtherTans(tan, function(tan, otherTan) {
			processTanPointEdge(tan, otherTan, function(point, edgePoint1, edgePoint2, edgeTangent, edgeNormal) {
				var signedDistance = VecMath.signedDistanceToEdge(point, edgePoint1, edgeNormal);
				var distance = Math.abs(signedDistance);
				if (distance < maxDistance) {
					var dot = point.dot(edgeTangent);
					var edgeDot1 = edgePoint1.dot(edgeTangent);
					var edgeDot2 = edgePoint2.dot(edgeTangent);
					if ((dot > edgeDot1 - eps) && (dot < edgeDot2 + eps)) {
						if ((closestDistance === undefined) || (distance < closestDistance)) {
							tanPoint = point;
							snapPoint.copy(edgeNormal).multiplyScalar(signedDistance).add(point);
							closestDistance = distance;
						}
					}
				}
			});
			// XXX These functions differs only in snap direction
			processTanPointEdge(otherTan, tan, function(point, edgePoint1, edgePoint2, edgeTangent, edgeNormal) {
				var signedDistance = VecMath.signedDistanceToEdge(point, edgePoint1, edgeNormal);
				var distance = Math.abs(signedDistance);
				if (distance < maxDistance) {
					var dot = point.dot(edgeTangent);
					var edgeDot1 = edgePoint1.dot(edgeTangent);
					var edgeDot2 = edgePoint2.dot(edgeTangent);
					if ((dot > edgeDot1 - eps) && (dot < edgeDot2 + eps)) {
						if ((closestDistance === undefined) || (distance < closestDistance)) {
							tanPoint = point;
							snapPoint.copy(edgeNormal).multiplyScalar(-signedDistance).add(point);
							closestDistance = distance;
						}
					}
				}
			});
			return true;
		});
		if (closestDistance === undefined) {
			return false;
		}
		snapTan(tan, tanPoint, snapPoint);
		return true;
	}

	snapTan(tan, pointDistance = 0.02, midDistance = 0.015, edgeDistance = 0.01, eps = 1e-9) {
		var prevPosition = tan.position.clone();
		var prevRotation = tan.rotation;
		if (this.snapTanPoint(tan, pointDistance * pointDistance)
				|| this.snapTanMid(tan, midDistance * midDistance)
				|| this.snapTanEdge(tan, edgeDistance, eps)) {
			var collisions = this.computeCollisions(tan);
			if ((collisions.length != 0) && (collisions[0].penetration > 10.0 * eps)) {
				tan.transform(prevPosition, prevRotation);
				return false;
			}
			return true;
		}
		return false;
	}

	isShapeFull(eps = 1e-7) {
		if (this.tans.length == 0) {
			return false;
		}
		var adjacentTans = new Array();
		adjacentTans.push(this.tans[0]);
		for (var i = 0; i < adjacentTans.length; i++) {
			var tan = adjacentTans[i];
			if (!tan.active) {
				return false;
			}
			for (var j = 0; j < this.tans.length; j++) {
				var otherTan = this.tans[j];
				if (otherTan.active && (otherTan !== tan)
						&& !adjacentTans.find(t => t === otherTan)
						&& doTansTouch(tan, otherTan, eps)) {
					adjacentTans.push(otherTan);
					if (adjacentTans.length == this.tans.length) {
						return true;
					}
				}
			}
		}
		return false;
	}

	computeAABB() {
		var min;
		var max;
		for (var i = 0; i < this.tans.length; i++) {
			var tan = this.tans[i];
			for (var j = 0; j < tan.points.length; j++) {
				var point = tan.points[j];
				if (min === undefined) {
					min = point.clone();
					max = point.clone();
				} else {
					if (point.x < min.x) min.x = point.x;
					if (point.y < min.y) min.y = point.y;
					if (point.x > max.x) max.x = point.x;
					if (point.y > max.y) max.y = point.y;
				}
			}
		}
		return { min: min, max: max };
	}

	encodeSnapshot(backgroundColor, foregroundColors) {
		if (foregroundColors.length != this.tans.length) {
			throw new Error("Foreground color count should be equal to tan count");
		}
		var aabb = this.computeAABB();
		var bytes = new Uint8Array(1 + 1 + 3 + foregroundColors.length * 3
				+ this.tans.length * 6 + 1);
		var index = 0;

		bytes[index++] = ENCODER_VERSION;
		bytes[index++] = this.dissection.id;

		bytes[index++] = backgroundColor.r;
		bytes[index++] = backgroundColor.g;
		bytes[index++] = backgroundColor.b;
		for (var i = 0; i < foregroundColors.length; i++) {
			var foregroundColor = foregroundColors[i];
			bytes[index++] = foregroundColor.r;
			bytes[index++] = foregroundColor.g;
			bytes[index++] = foregroundColor.b;
		}

		for (var i = 0; i < this.tans.length; i++) {
			var tan = this.tans[i];
			var x = Math.max(0x0000, Math.min(0xffff, Math.round(
					(tan.position.x - aabb.min.x) * ENCODE_POSITION_SCALE)));
			var y = Math.max(0x0000, Math.min(0xffff, Math.round(
					(tan.position.y - aabb.min.y) * ENCODE_POSITION_SCALE)));
			var a = Math.max(0x0000, Math.min(0xffff, Math.round(
					(((tan.rotation % 360.0) + 360.0) % 360.0) * ENCODE_ROTATION_SCALE)));
			bytes[index++] = (x & 0xff);
			bytes[index++] = ((x >> 8) & 0xff);
			bytes[index++] = (y & 0xff);
			bytes[index++] = ((y >> 8) & 0xff);
			bytes[index++] = (a & 0xff);
			bytes[index++] = ((a >> 8) & 0xff);
		}

		var crc = 0x00;
		for (var i = 0; i < bytes.length - 1; i++) {
			crc ^= bytes[i];
		}
		bytes[bytes.length - 1] = crc;

		return Base64.encodeUrlSafe(bytes);
	}

}

export function decodeSnapshot(urlEncodedSnapshot, dissection) {
	var bytes = Base64.decodeUrlSafe(urlEncodedSnapshot);

	if (bytes.length < 1) {
		throw new Error("CRC not found");
	}

	var crc = 0x00;
	for (var i = 0; i < bytes.length; i++) {
		crc ^= bytes[i];
	}
	if (crc != 0x00) {
		throw new Error("Failed crc check");
	}

	var index = 0;
	if (bytes.length - 1 - index < 1) {
		throw new Error("Snapshot version not found");
	}
	var version = bytes[index++];
	if (version > ENCODER_VERSION) {
		throw new Error("Unsupported snapshot version (" + version + ")");
	}

	if (bytes.length - 1 - index < 1) {
		throw new Error("Dissection id not found");
	}
	var dissectionId = bytes[index++];
	if (dissectionId != dissection.id) {
		throw new Error("Dissection id (" + dissectionId + ") does not match supplied dissection with id ("
				+ dissection.id + ")");
	}

	if (bytes.length - 1 - index < 1 + 3 * dissection.polygons.length) {
		throw new Error("Colors not found");
	}
	var backgroundColor = new Color((bytes[index++] & 0xFF),
			(bytes[index++] & 0xFF), (bytes[index++] & 0xFF));
	var foregroundColors = new Array(dissection.polygons.length);
	for (var i = 0; i < dissection.polygons.length; i++) {
		foregroundColors[i] = new Color((bytes[index++] & 0xFF),
				(bytes[index++] & 0xFF), (bytes[index++] & 0xFF));
	}

	if (bytes.length - 1 - index < 6 * dissection.polygons.length) {
		throw new Error("Transforms not found");
	}
	var transforms = new Array(dissection.polygons.length);
	for (var i = 0; i < dissection.polygons.length; i++) {
		var x = ((bytes[index++] & 0xFF) | ((bytes[index++] & 0xFF) << 8))
				* DECODE_POSITION_SCALE;
		var y = ((bytes[index++] & 0xFF) | ((bytes[index++] & 0xFF) << 8))
				* DECODE_POSITION_SCALE;
		var a = ((bytes[index++] & 0xFF) | ((bytes[index++] & 0xFF) << 8))
				* DECODE_ROTATION_SCALE;
		transforms[i] = new Transform(new VecMath.Vector(x, y), a);
	}

	if (index != bytes.length - 1) {
		throw new Error("Remain " + (index - (bytes.length - 1))
				+ " bytes undecoded");
	}

	return new Snapshot(dissection, transforms, backgroundColor, foregroundColors);
}

export function createShape(dissection, transforms) {
	if (transforms.length != dissection.polygons.length) {
		throw new Error("Transform count (" + transforms.length
				+ ") does not match the number of polygons ("
				+ dissection.polygons.length + ")");
	}
	var tangram = new Tangram(dissection);
	for (var i = 0; i < transforms.length; i++) {
		var transform = transforms[i];
		tangram.tans[i].transform(transform.position, transform.rotation);
	}
	return tangram;
}
