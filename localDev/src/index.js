/// <reference path="../../dist/preview release/babylon.d.ts"/>
"use strict";

var TEXTURE_DIMENSIONS = {
	width: 1024,
	height: 1024
};

var getRandomColor = function() {
	var letters = '0123456789ABCDEF';
	var color = '#';
	for (var i = 0; i < 6; i++) {
		color += letters[Math.floor(Math.random() * 16)];
	}
	return color;
};

var Rectangle = function(left, top, right, bottom) {
	this.top = top;
	this.bottom = bottom;
	this.left = left;
	this.right = right;
};

Rectangle.prototype.getWidth = function() {
	return this.right - this.left + 1;
};

Rectangle.prototype.getHeight = function() {
	return this.top - this.bottom + 1;
};

Rectangle.prototype.isFitting = function(img) {
	return (img.height <= this.getHeight()) && (img.width <= this.getWidth());
};

Rectangle.prototype.perfectFit = function(img) {
	return (img.height == this.getHeight()) && (img.width == this.getWidth());
};

var ImageItem = function(id) {
	this.width = -1;
	this.height = -1;
	this.id = id;
	this.uvInfos = [];
	this.minWorld = null;
	this.maxWorld = null;
};

var Node = function() {
	this.child = [null, null]
	this.rc = null;
	this.image = null;
};

ImageItem.Padding = 3; // Padding is on bottom and left

Node.prototype.getAllNodes = function() {
	var nodes = [];
	if (this.image) {
		nodes.push(this);
	}
	if (this.child[0]) {
		nodes = nodes.concat(this.child[0].getAllNodes());
	}
	if (this.child[1]) {
		nodes = nodes.concat(this.child[1].getAllNodes());
	}

	return nodes;
};

Node.CreateRoot = function() {
	var node = new Node();
	node.rc = new Rectangle(0, TEXTURE_DIMENSIONS.height - 1, TEXTURE_DIMENSIONS.width - 1, 0);

	return node;
};

Node.prototype.insert = function(img) {
	if (this.child[0] && this.child[1]) {
		var newNode = this.child[0].insert(img);

		if (newNode) {
			return newNode;
		}

		return this.child[1].insert(img);
	} else {
		if (this.image) {
			return null;
		}

		if (!this.rc.isFitting(img)) {
			return null;
		}

		if (this.rc.perfectFit(img)) {
			this.image = img;
			return this;
		}

		this.child[0] = new Node();
		this.child[1] = new Node();

		var dw = this.rc.getWidth() - img.width;
		var dh = this.rc.getHeight() - img.height;

		if (dw > dh) {
			this.child[0].rc = new Rectangle(this.rc.left, this.rc.top, this.rc.left + img.width - 1, this.rc.bottom);
			this.child[1].rc = new Rectangle(this.rc.left + img.width, this.rc.top, this.rc.right, this.rc.bottom);
		} else {
			this.child[0].rc = new Rectangle(this.rc.left, this.rc.bottom + img.height - 1, this.rc.right, this.rc.bottom);
			this.child[1].rc = new Rectangle(this.rc.left, this.rc.top, this.rc.right, this.rc.bottom + img.height);
		}

		return this.child[0].insert(img);
	}
};

var createDebugTexture = function(root, scene) {
	var size = TEXTURE_DIMENSIONS.width;

	var debugTexture;
	debugTexture = new BABYLON.DynamicTexture("debug", size, scene, false, BABYLON.Texture.NEAREST_SAMPLINGMODE);
	debugTexture.wrapU = BABYLON.Texture.WRAP_ADDRESSMODE;
	debugTexture.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE;

	var context = debugTexture.getContext();

	var nodes = root.getAllNodes();

	for (var i = 0; i < nodes.length; i++) {
		var node = nodes[i];
		if (!node.image) {
			continue;
		}
		context.fillStyle = node.image.id;
		context.fillRect(node.rc.left + ImageItem.Padding, node.rc.bottom + ImageItem.Padding, node.image.width - ImageItem.Padding, node.image.height - ImageItem.Padding);
	}

	debugTexture.update(false);

	return debugTexture;
};

var createScene = function() {
	var scene = new BABYLON.Scene(engine);
	var camera = new BABYLON.ArcRotateCamera("Camera", 0, Math.PI / 2, 12, BABYLON.Vector3.Zero(), scene);
	camera.attachControl(canvas, true);

	var box, material;
	for (var i = 0; i < 1; i++) {
		for (var j = 0; j < 1; j++) {
			box = BABYLON.Mesh.CreateSphere("test", 3, 10, scene);
			material = new BABYLON.StandardMaterial("mat" + i + j, scene);
			material.emissiveColor.copyFromFloats(0.7, 0.7, 0.7);
			// box.rotation.x = Math.sin(j * i);
			// box.rotation.z = Math.cos(i + j);
			box.position.x += i * 5 - 12.5;
			box.position.z += j * 5 - 12.5;
			box.material = material;
		}
	}

	var light = new BABYLON.HemisphericLight("light", new BABYLON.Vector3(0, -1, 0), scene);

	uv1ToUv2(scene);
	debugDisks(scene);

	return scene;
};

var turnVerticesToDisks = function() {
	var vertices = scene.vertices;
};

var uv1ToUv2 = function(scene) {
	var meshes = scene.meshes;
	var density = 7; // pixel / scene unit

	var root = Node.CreateRoot();

	for (var i = 0; i < meshes.length; i++) {
		var mesh = meshes[i];
		var vertices = mesh.getVerticesData(BABYLON.VertexBuffer.PositionKind);
		var indices = mesh.getIndices();
		console.log("Indices current Length : " + indices.length);
		console.log("Vertices current Length : " + vertices.length);
		var normals = mesh.getVerticesData(BABYLON.VertexBuffer.NormalKind);

		var uv2s = [];
		var worldMatrix = mesh.getWorldMatrix(true);

		for (var j = 0; j < vertices.length / 3; j++) {
			var vertex = new BABYLON.Vector3(vertices[j * 3], vertices[j * 3 + 1], vertices[j * 3 + 2]);

			var worldVertex = BABYLON.Vector3.TransformCoordinates(vertex, worldMatrix);
			vertices[j * 3] = worldVertex.x;
			vertices[j * 3 + 1] = worldVertex.y;
			vertices[j * 3 + 2] = worldVertex.z;
		}

		var directions = sortFacesByNormal(vertices, indices, normals);
		var uvIslands = projectInUvSpace(directions, indices, vertices);
		var images = makeImagesFromUvIslands(uvIslands, density);

		for (var j = 0; j < images.length; j++) {
			root.insert(images[j]);
		}

		updateUv2sFromIslands(root, mesh, density, vertices, normals);
		console.log("Effective faces  : " + indices.length / 3);
		console.log("Faces processed  : " + faceCount);
		console.log("Faces in UV Islands : " + facesInIsland);
		console.log("Indices new Length : " + indices.length);
		console.log("Vertices new Length : " + vertices.length);
		console.log("Vertices creation : " + vertexCreation);
	}


	var debugTexture = createDebugTexture(root, scene);

	for (var i = 0; i < meshes.length; i++) {
		var mesh = meshes[i];
		mesh.material.diffuseTexture = debugTexture//new BABYLON.Texture("./test.jpeg", scene);
	}

	var debugBox = BABYLON.Mesh.CreateBox("debugbox", 10, scene);
	debugBox.position.y += 15;
	debugBox.material = new BABYLON.StandardMaterial("debug", scene);
	debugBox.material.diffuseTexture = createUvTexture(scene);
	// debugBox.material.diffuseTexture = debugTexture;
};

var updateUv2sFromIslands = function(root, mesh, density, vertices, normals) {
	var nodes = root.getAllNodes();
	var indices = mesh.getIndices();
	var uv2s = [];

	for (var i = 0; i < nodes.length; i++) {
		var uvInfos = nodes[i].image.uvInfos;
		var offsetX = (nodes[i].rc.left + ImageItem.Padding) / TEXTURE_DIMENSIONS.width;
		var offsetY = (nodes[i].rc.bottom + ImageItem.Padding) / TEXTURE_DIMENSIONS.height;
		var width = nodes[i].rc.getWidth() / TEXTURE_DIMENSIONS.width;
		var height = nodes[i].rc.getHeight() / TEXTURE_DIMENSIONS.height;
		var minWorld = nodes[i].image.minWorld;
		var maxWorld = nodes[i].image.maxWorld;

		console.log(offsetX, offsetY);
		for (var j = 0; j < uvInfos.length; j++) {
			var trueUv = uvInfos[j].uv.subtract(minWorld).multiplyInPlace(new BABYLON.Vector2(1 / TEXTURE_DIMENSIONS.width, 1 / TEXTURE_DIMENSIONS.height)).scaleInPlace(density);
			if (uv2s[uvInfos[j].index * 2] === undefined) {
				uv2s[uvInfos[j].index * 2] = trueUv.x + offsetX;
				uv2s[uvInfos[j].index * 2 + 1] = trueUv.y + offsetY;				
			} else {
				console.log("duplicate value of uv");
				console.log("difference x: " + (trueUv.x + offsetX - uv2s[uvInfos[j].index * 2]));
				console.log("difference y: " + (trueUv.y + offsetY - uv2s[uvInfos[j].index * 2 + 1]));
			}

			if (trueUv.x < 0 || trueUv.x > width || trueUv.y < 0 || trueUv > height) {
				console.log("out of bounds");
			}
		}
	}

	mesh.setVerticesData(BABYLON.VertexBuffer.UVKind, uv2s);
	mesh.setVerticesData(BABYLON.VertexBuffer.PositionKind, vertices);
	mesh.setVerticesData(BABYLON.VertexBuffer.NormalKind, normals);
	mesh.setIndices(indices);
	console.log("uv2s Length : " + uv2s.length);

}

var makeImagesFromUvIslands = function(uvIslands, density) {
	var images = [];

	for (var i = 0; i < uvIslands.length; i++) {
		for (var j = 0; j < uvIslands[i].length; j++) {
			if (!uvIslands[i][j].length) {
				console.warn("problem with uv islands")
				continue;
			}
			var boundingBox = {
				min: new BABYLON.Vector2(+Infinity, +Infinity),
				max: new BABYLON.Vector2(-Infinity, -Infinity),
			};
			var img = new ImageItem(getRandomColor());

			for (var k = 0; k < uvIslands[i][j].length; k++) {
				var uv = uvIslands[i][j][k].uv;
				boundingBox.min.x = Math.min(uv.x, boundingBox.min.x);
				boundingBox.max.x = Math.max(uv.x, boundingBox.max.x);
				boundingBox.min.y = Math.min(uv.y, boundingBox.min.y);
				boundingBox.max.y = Math.max(uv.y, boundingBox.max.y);
				img.uvInfos.push(uvIslands[i][j][k]);
			}

			img.width = Math.ceil((boundingBox.max.x - boundingBox.min.x) * density) + ImageItem.Padding;
			img.height = Math.ceil((boundingBox.max.y - boundingBox.min.y) * density) + ImageItem.Padding;
			img.minWorld = boundingBox.min;
			img.maxWorld = boundingBox.max;
			images.push(img);
		}
	}

	return images;
};

var facesInIsland = 0;
var vertexCreation = 0;
var projectInUvSpace = function(directions, indices, vertices) {
	var dirVectors = [
		[new BABYLON.Vector3(0, 1, 0), new BABYLON.Vector3(0, 0, 1)], // px
		[new BABYLON.Vector3(0, 1, 0), new BABYLON.Vector3(0, 0, 1)], // nx
		[new BABYLON.Vector3(0, 0, 1), new BABYLON.Vector3(1, 0, 0)], // py
		[new BABYLON.Vector3(0, 0, 1), new BABYLON.Vector3(1, 0, 0)], // ny
		[new BABYLON.Vector3(0, 1, 0), new BABYLON.Vector3(1, 0, 0)], // pz
		[new BABYLON.Vector3(0, 1, 0), new BABYLON.Vector3(1, 0, 0)], // nz
	];

	var result = [];

	for (var i = 0; i < directions.length; i++) {
		result.push([]);
		for (var j = 0; j < directions[i].length; j++) {
			result[i].push([]);
			for (var k = 0; k < directions[i][j].faces.length; k++) {
				var faceId = directions[i][j].faces[k];
				var i0 = indices[faceId * 3];
				var i1 = indices[faceId * 3 + 1];
				var i2 = indices[faceId * 3 + 2];

				var v0 = new BABYLON.Vector3(vertices[i0 * 3], vertices[i0 * 3 + 1], vertices[i0 * 3 + 2]);
				var v1 = new BABYLON.Vector3(vertices[i1 * 3], vertices[i1 * 3 + 1], vertices[i1 * 3 + 2]);
				var v2 = new BABYLON.Vector3(vertices[i2 * 3], vertices[i2 * 3 + 1], vertices[i2 * 3 + 2]);

				var uv0 = new BABYLON.Vector2(BABYLON.Vector3.Dot(v0, dirVectors[i][0]), BABYLON.Vector3.Dot(v0, dirVectors[i][1]));
				var uv1 = new BABYLON.Vector2(BABYLON.Vector3.Dot(v1, dirVectors[i][0]), BABYLON.Vector3.Dot(v1, dirVectors[i][1]));
				var uv2 = new BABYLON.Vector2(BABYLON.Vector3.Dot(v2, dirVectors[i][0]), BABYLON.Vector3.Dot(v2, dirVectors[i][1]));
				result[i][j].push({
					uv: uv0,
					index: i0
				}, {
					uv: uv1,
					index: i1
				}, {
					uv: uv2,
					index: i2
				});
				facesInIsland++;
			}
		}
	}

	return result;
};


var FaceBatch = function() {
	this.faces = [];
	this.id = FaceBatch.ID++;
	this.directionId = -1;
};

FaceBatch.prototype.mergeInto = function(otherBatch, batchCache, indices) {
	if (otherBatch === this) {
		return;
	}

	if (otherBatch.directionId != this.directionId) {
		console.warn("Trying to merge into 2 different direction batches");
		return;
	}

	for (var i = this.faces.length - 1; i >= 0; i--) {
		otherBatch.faces.push(this.faces[i]);
		var i0 = indices[this.faces[i] * 3];
		var i1 = indices[this.faces[i] * 3 + 1];
		var i2 = indices[this.faces[i] * 3 + 2];
		batchCache[i0] = otherBatch;
		batchCache[i1] = otherBatch;
		batchCache[i2] = otherBatch;
	}
	this.faces.length = 0;
};

FaceBatch.ID = 0;
var faceCount = 0;
var pushFace = function(directions, directionId, batchCache, duplicateCache, faceId, i0, i1, i2, vertices, indices, normals) {
	var batch;
	var tempFace = [i0, i1, i2];

	for (var i = 0; i < 3; i++) {
		if (batchCache[tempFace[i]] !== undefined) {
			// tempFace[i] already has a batch, we check it's the same direction
			if (batchCache[tempFace[i]].directionId !== directionId) {
				var duplicateIndex = -1;
				if (duplicateCache[tempFace[i]]) {
					for (var j = 0; j < duplicateCache[tempFace[i]].length; j++) {
						if (duplicateCache[tempFace[i]][j].directionId === directionId) {
							// Use this vertex
							console.log("reusing duplicate vertex");
							duplicateIndex = duplicateCache[tempFace[i]][j].index;

							if (!batchCache[duplicateIndex]) {
								console.warn("nonsense");

							}
							if (batch) {
								batchCache[duplicateIndex].mergeInto(batch, batchCache, indices);
								if (batch !== batchCache[duplicateIndex]) {
									var id = directions[directionId].indexOf(batchCache[duplicateIndex]);
									if (id === -1) {
										console.warn("Batch not found ");
									}
									directions[directionId].splice(id, 1);
								}
							} else {
								batch = batchCache[duplicateIndex];
							}

							break;
						}
					}
				}

				if (duplicateIndex === -1) {
					// It's not, we have to duplicate the vertex
					var vertex = new BABYLON.Vector3(vertices[tempFace[i] * 3], vertices[tempFace[i] * 3 + 1], vertices[tempFace[i] * 3 + 2]);
					var normal = new BABYLON.Vector3(normals[tempFace[i] * 3], normals[tempFace[i] * 3 + 1], normals[tempFace[i] * 3 + 2]);
					vertices.push(vertex.x, vertex.y, vertex.z);
					normals.push(normal.x, normal.y, normal.z);
					if (!duplicateCache[tempFace[i]]) {
						duplicateCache[tempFace[i]] = [];
					}
					duplicateIndex = vertices.length / 3 - 1;
					duplicateCache[tempFace[i]].push({
						directionId: directionId,
						index: duplicateIndex
					});
					vertexCreation++;
					duplicateCache[duplicateIndex] = [{
						directionId: directionId,
						index: tempFace[i]
					}];
				}

				indices[faceId * 3 + i] = duplicateIndex;
				tempFace[i] = duplicateIndex;
			} else {
				// It is ! we can use this facebatch to make connexity
				// But if we already have a batch, we can merge them
				if (batch) {
					batchCache[tempFace[i]].mergeInto(batch, batchCache, indices);
					if (batch !== batchCache[tempFace[i]]) {
						var id = directions[directionId].indexOf(batchCache[tempFace[i]]);
						if (id === -1) {
							console.warn("Batch not found ");
						}
						directions[directionId].splice(id, 1);
					}
				} else {
					batch = batchCache[tempFace[i]];
				}
			}
		}
	}

	if (!batch) {
		batch = new FaceBatch();
		directions[directionId].push(batch);
		batch.directionId = directionId;
	}

	batchCache[tempFace[0]] = batch;
	batchCache[tempFace[1]] = batch;
	batchCache[tempFace[2]] = batch;
	batch.faces.push(faceId);

	faceCount++;
};

var sortFacesByNormal = function(vertices, indices, normals) {
	var directions = [
		[], // px
		[], // nx
		[], // py
		[], // ny
		[], // pz
		[], // nz
	];

	var batchCache = [];
	var duplicateCache = [];

	for (var i = 0; i < indices.length; i += 3) {
		var i0 = indices[i];
		var i1 = indices[i + 1];
		var i2 = indices[i + 2];

		var v0 = new BABYLON.Vector3(vertices[i0 * 3], vertices[i0 * 3 + 1], vertices[i0 * 3 + 2]);
		var v1 = new BABYLON.Vector3(vertices[i1 * 3], vertices[i1 * 3 + 1], vertices[i1 * 3 + 2]);
		var v2 = new BABYLON.Vector3(vertices[i2 * 3], vertices[i2 * 3 + 1], vertices[i2 * 3 + 2]);
		var v1v0 = v1.subtract(v0);
		var v2v0 = v2.subtract(v0);

		var normal = BABYLON.Vector3.Cross(v1v0, v2v0); // good direction ?
		normal.normalize();

		if (Math.abs(normal.x) >= Math.abs(normal.y) && Math.abs(normal.x) >= Math.abs(normal.z)) {
			if (normal.x >= 0) {
				// Positive x
				pushFace(directions, 0, batchCache, duplicateCache, i / 3, i0, i1, i2, vertices, indices, normals)
			} else {
				// Negative x
				pushFace(directions, 1, batchCache, duplicateCache, i / 3, i0, i1, i2, vertices, indices, normals)
			}
		} else if (Math.abs(normal.y) >= Math.abs(normal.x) && Math.abs(normal.y) >= Math.abs(normal.z)) {
			if (normal.y >= 0) {
				// Positive y
				pushFace(directions, 2, batchCache, duplicateCache, i / 3, i0, i1, i2, vertices, indices, normals)
			} else {
				// Negative y
				pushFace(directions, 3, batchCache, duplicateCache, i / 3, i0, i1, i2, vertices, indices, normals)
			}
		} else if (Math.abs(normal.z) >= Math.abs(normal.x) && Math.abs(normal.z) >= Math.abs(normal.y)) {
			if (normal.z >= 0) {
				// Positive z
				pushFace(directions, 4, batchCache, duplicateCache, i / 3, i0, i1, i2, vertices, indices, normals)
			} else {
				// Negative z
				pushFace(directions, 5, batchCache, duplicateCache, i / 3, i0, i1, i2, vertices, indices, normals)
			}
		} else {
			console.log("should not happen");
		}
	}

	return directions;
}

// Disk hierarchy

var Disk = function(center, radius, normal) {
	this.center = center;
	this.radius = radius;
	this.normal = normal;
	this.lightMapPosition = null;
};

Disk.prototype.merge = function(otherDisk) {
	var center = this.center.add(otherDisk.center).scaleInPlace(1/2);
	var normal = this.normal.add(otherDisk.normal).scaleInPlace(1/2);
	var radius = Math.sqrt(this.radius*this.radius + otherDisk.radius * otherDisk.radius);
	var newDisk = new Disk(center, radius, normal);

	return newDisk;
}

Disk.prototype.measureSimilarity = function(otherDisk) {
	// Similarity decrease linearly with squared distance and with angle
	var vector = (otherDisk.center.subtract(this.center));
	var similarity = 1 / (vector.x*vector.x + vector.y*vector.y);
	similarity *= BABYLON.Vector3.Dot(otherDisk.normal, this.normal);
	return similarity;
};

Disk.prototype.findBestMatch = function(diskHierarchies) {
	var score = -Infinity;
	var candidate = null;
	var similarity;

	for (var i = 0; i < diskHierarchies.length; i++) {
		if (diskHierarchies[i].disk === this) {
			continue;
		}

		similarity = this.measureSimilarity(diskHierarchies[i].disk);
		if (similarity > score) {
			score = similarity;
			candidate = diskHierarchies[i];
		}
	}

	return candidate;
}

var DiskHierarchy = function(disk) {
	this.children = [];
	this.parent = null;
	this.disk = disk;
}

DiskHierarchy.prototype.getAllDisks = function(list) {
	list = list || [];

	if (this.disk) {
		list.push(this.disk);
	}

	for (var i = 0; i < this.children.length; i++) {
		this.children[i].traverse(list);
	}

	return list;
}

DiskHierarchy.prototype.traverse = function(fn) {
	if (this.disk) {
		fn(this.disk);
	}

	for (var i = 0; i < this.children.length; i++) {
		this.children[i].traverse(fn);
	}
}

DiskHierarchy.Build = function(disks) {
	// disks is a list of DiskHierarchy
	if (disks.length === 1) {
		return disks[0];
	}

	var nextLevel = [];
	while (disks.length) {
		var disk = disks.pop();
		var match = disk.disk.findBestMatch(disks);

		var result = disk.disk.merge(match.disk);
		var newNode = new DiskHierarchy(result);

		disks.splice(disks.indexOf(match), 1);

		// Build references
		newNode.children.push(disk, match);
		disk.parent = newNode;
		match.parent = newNode;

		nextLevel.push(newNode);
		if (disks.length === 1) {
			nextLevel.push(disks[0]);
			disks.length = 0;
		}
	}

	return DiskHierarchy.Build(nextLevel);
}

var rand = function(min, max) {
	return Math.random()*(max-min) + min;
}

var generateRandomDisks = function(number, sphereRadius) {
	sphereRadius = sphereRadius || 100;

	var list = [];
	for (var i = 0; i < number; i++) {
		var center = new BABYLON.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1));
		var normal = new BABYLON.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1));
		center.normalize().scaleInPlace(rand(0, sphereRadius));
		normal.normalize();

		var disk = new Disk(center, rand(0.2, 2), normal);

		list.push(new DiskHierarchy(disk));
	}
	return list;
}

var debugDisks = function(scene) {
	var list = generateRandomDisks(5, 25);
	var hierarchy = DiskHierarchy.Build(list);
	hierarchy.traverse(function(disk) {
		var mesh = BABYLON.Mesh.CreateDisc("disk", disk.radius, 5, scene);
		mesh.position.copyFrom(disk.center);
		var axis = BABYLON.Vector3.Cross(disk.normal, new BABYLON.Vector3(0, 0, 1));
		var angle = Math.acos(disk.normal.z);
		mesh.rotationQuaternion = BABYLON.Quaternion.RotationAxis(axis, angle);
	});
}

var createUvTexture = function(scene) {
	var texture = new BABYLON.RenderTargetTexture("debug", TEXTURE_DIMENSIONS, scene, false, true, BABYLON.Engine.TEXTURETYPE_UNSIGNED_INT, false, BABYLON.Texture.NEAREST_SAMPLINGMODE, true, false);
	texture.refreshRate = 1;
	// texture.resetRefreshCounter();
	texture.renderList = null;
	scene.customRenderTargets.push(texture);

	var effect, cachedDefines;

	var isReady = function(subMesh, useInstances) {
	    var material = subMesh.getMaterial();
	    if (material.disableDepthWrite) {
	        return false;
	    }

	    var defines = [];

	    var attribs = [BABYLON.VertexBuffer.PositionKind];

	    var mesh = subMesh.getMesh();
	    var scene = mesh.getScene();

	    // Alpha test
	    if (material && material.needAlphaTesting()) {
	        defines.push("#define ALPHATEST");
	        if (mesh.isVerticesDataPresent(BABYLON.VertexBuffer.UVKind)) {
	            attribs.push(BABYLON.VertexBuffer.UVKind);
	            defines.push("#define UV1");
	        }
	        if (mesh.isVerticesDataPresent(BABYLON.VertexBuffer.UV2Kind)) {
	            attribs.push(BABYLON.VertexBuffer.UV2Kind);
	            defines.push("#define UV2");
	        }
	    }

	    // Bones
	    if (mesh.useBones && mesh.computeBonesUsingShaders) {
	        attribs.push(BABYLON.VertexBuffer.MatricesIndicesKind);
	        attribs.push(BABYLON.VertexBuffer.MatricesWeightsKind);
	        if (mesh.numBoneInfluencers > 4) {
	            attribs.push(BABYLON.VertexBuffer.MatricesIndicesExtraKind);
	            attribs.push(BABYLON.VertexBuffer.MatricesWeightsExtraKind);
	        }
	        defines.push("#define NUM_BONE_INFLUENCERS " + mesh.numBoneInfluencers);
	        defines.push("#define BonesPerMesh " + (mesh.skeleton.bones.length + 1));
	    } else {
	        defines.push("#define NUM_BONE_INFLUENCERS 0");
	    }

	    // Instances
	    if (useInstances) {
	        defines.push("#define INSTANCES");
	        attribs.push("world0");
	        attribs.push("world1");
	        attribs.push("world2");
	        attribs.push("world3");
	    }

	    // Get correct effect      
	    var join = defines.join("\n");
	    if (cachedDefines !== join) {
	        cachedDefines = join;
	        effect = scene.getEngine().createEffect("depth",
	            attribs,
	            ["world", "mBones", "viewProjection", "diffuseMatrix", "far"],
	            ["diffuseSampler"], join);
	    }

	    return effect.isReady();
	}

	// Custom render function
	var renderSubMesh = function(subMesh) {
	    var mesh = subMesh.getRenderingMesh();
	    var engine = scene.getEngine();

	    // Culling
	    engine.setState(subMesh.getMaterial().backFaceCulling);

	    // Managing instances
	    var batch = mesh._getInstancesRenderList(subMesh._id);

	    if (batch.mustReturn) {
	        return;
	    }

	    var hardwareInstancedRendering = (engine.getCaps().instancedArrays !== null) && (batch.visibleInstances[subMesh._id] !== null);

	    if (isReady(subMesh, hardwareInstancedRendering)) {
	        engine.enableEffect(effect);
	        mesh._bind(subMesh, effect, BABYLON.Material.TriangleFillMode);
	        var material = subMesh.getMaterial();

	        effect.setMatrix("viewProjection", scene.getTransformMatrix());

	        effect.setFloat("far", scene.activeCamera.maxZ);

	        // Alpha test
	        if (material && material.needAlphaTesting()) {
	            var alphaTexture = material.getAlphaTestTexture();
	            effect.setTexture("diffuseSampler", alphaTexture);
	            effect.setMatrix("diffuseMatrix", alphaTexture.getTextureMatrix());
	        }

	        // Bones
	        if (mesh.useBones && mesh.computeBonesUsingShaders) {
	            effect.setMatrices("mBones", mesh.skeleton.getTransformMatrices(mesh));
	        }

	        // Draw
	        mesh._processRendering(subMesh, effect, BABYLON.Material.TriangleFillMode, batch, hardwareInstancedRendering,
	            function (isInstance, world) { effect.setMatrix("world", world) });
	    }
	};

	texture.customRenderFunction = function(opaqueSubMeshes, alphaTestSubMeshes) {
	    var index;

	    for (index = 0; index < opaqueSubMeshes.length; index++) {
	        renderSubMesh(opaqueSubMeshes.data[index]);
	    }

	    for (index = 0; index < alphaTestSubMeshes.length; index++) {
	        renderSubMesh(alphaTestSubMeshes.data[index]);
	    }
	};

	// TriangleFillMode
	// WireFrameFillMode
	// PointFillMode

	return texture;
}