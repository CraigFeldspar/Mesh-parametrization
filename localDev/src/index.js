/// <reference path="../../dist/preview release/babylon.d.ts"/>
var TEXTURE_DIMENSIONS = {
	width: 1024,
	height: 1024
};

var getRandomColor = function() {
    var letters = '0123456789ABCDEF';
    var color = '#';
    for (var i = 0; i < 6; i++ ) {
        color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
}

var Rectangle = function(left, top, right, bottom) {
	this.top = top;
	this.bottom = bottom;
	this.left = left;
	this.right = right;
};

Rectangle.prototype.getWidth = function() {
	return this.right - this.left + 1;
}

Rectangle.prototype.getHeight = function() {
	return this.top - this.bottom + 1;
}

Rectangle.prototype.isFitting = function(img) {
	return (img.height <= this.getHeight()) && (img.width <= this.getWidth());
}

Rectangle.prototype.perfectFit = function(img) {
	return (img.height == this.getHeight()) && (img.width == this.getWidth());
}

var ImageItem = function(id) {
	this.width = -1;
	this.height = -1;
	this.id = id;
}

var Node = function() {
	this.child = [null, null]
	this.rc = null;
	this.image = null;
};

ImageItem.Padding = 0; // Padding is on bottom and left

Node.prototype.getAllNodes = function() {
	var nodes = [this];
	if (this.child[0]) {
		nodes = nodes.concat(this.child[0].getAllNodes());
	}
	if (this.child[1]) {
		nodes = nodes.concat(this.child[1].getAllNodes());
	}

	return nodes;
}

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
			this.child[1].rc = new Rectangle(this.rc.left, this.rc.top, this.rc.right,this.rc.bottom + img.height);
		}

		return this.child[0].insert(img);
	}
}

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
    	context.fillRect(node.rc.top + ImageItem.Padding, node.rc.left + ImageItem.Padding, node.image.width - ImageItem.Padding, node.image.height - ImageItem.Padding);
    }

    debugTexture.update(false);

    return debugTexture;
}

var createScene = function() {
	var scene = new BABYLON.Scene(engine);
	var camera = new BABYLON.ArcRotateCamera("Camera", 0, Math.PI / 2, 12, BABYLON.Vector3.Zero(), scene);
	camera.attachControl(canvas, true);

	var box, material;
	for (var i = 0; i < 1; i++) {
		for (var j = 0; j < 1; j++) {
			box = BABYLON.Mesh.CreateSphere("test", 5, 8, scene);
			material = new BABYLON.StandardMaterial("mat" + i + j, scene);
			material.emissiveColor.copyFromFloats(0.7, 0.7, 0.7);
			box.rotation.x = Math.sin(j*i);
			box.rotation.z = Math.cos(i + j);
			box.position.x += i*5 - 12.5;
			box.position.z += j*5 - 12.5;
			box.material = material;
		}
	}

	var light = new BABYLON.HemisphericLight("light", new BABYLON.Vector3(0, -1, 0), scene);

	uv1ToUv2(scene);

	return scene;
};

var turnVerticesToDisks = function() {
	var vertices = scene.vertices;
}

var uv1ToUv2 = function(scene) {
	var meshes = scene.meshes;
	var density = 15; // pixel / scene unit

	var root = Node.CreateRoot();

	for (var i = 0; i < meshes.length; i++) {
		var mesh = meshes[i];
		var vertices = mesh.getVerticesData(BABYLON.VertexBuffer.PositionKind);
		var indices = mesh.getIndices();
		var normals = mesh.getVerticesData(BABYLON.VertexBuffer.NormalKind);

		var uv2s = [];

		var directions = sortFacesByNormal(vertices, indices);
		var uvIslands = projectInUvSpace(directions, indices, vertices);
		var images = makeImagesFromUvIslands(uvIslands, density);

		for (var j = 0; j < images.length; j++) {
			root.insert(images[j]);
		}
	}

	console.log(root);

	var debugTexture = createDebugTexture(root, scene);

	var debugBox = BABYLON.Mesh.CreateBox("debugbox", 10, scene);
	debugBox.position.y += 15;
	debugBox.material = new BABYLON.StandardMaterial("debug", scene);
	debugBox.material.diffuseTexture = debugTexture;
}

var makeImagesFromUvIslands = function(uvIslands, density) {
	var images = [];

	for (var i = 0; i < uvIslands.length; i++) {
		for (var j = 0; j < uvIslands[i].length; j++) {
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
			}

			img.width = Math.ceil((boundingBox.max.x - boundingBox.min.x) * density) + ImageItem.Padding;
			img.height = Math.ceil((boundingBox.max.y - boundingBox.min.y) * density) + ImageItem.Padding;
			images.push(img);
		}
	}

	return images;
};

var projectInUvSpace = function(directions, indices, vertices) {
	var dirVectors = [
		[ new BABYLON.Vector3(0, 1, 0), new BABYLON.Vector3(0, 0, 1) ], // px
		[ new BABYLON.Vector3(0, 1, 0), new BABYLON.Vector3(0, 0, 1) ], // nx
		[ new BABYLON.Vector3(1, 0, 0), new BABYLON.Vector3(0, 0, 1) ], // py
		[ new BABYLON.Vector3(1, 0, 0), new BABYLON.Vector3(0, 0, 1) ], // ny
		[ new BABYLON.Vector3(1, 0, 0), new BABYLON.Vector3(0, 1, 0) ], // pz
		[ new BABYLON.Vector3(1, 0, 0), new BABYLON.Vector3(0, 1, 0) ], // nz
	];

	var result = [];

	for (var i = 0; i < directions.length; i++) {
		result.push([]);
		for (var j = 0; j < directions[i].length; j++) {
			result[i].push([]);
			for (var k = 0; k < directions[i][j].faces.length; k++) {
				var faceId = directions[i][j].faces[k];
				var i0 = indices[faceId];
				var i1 = indices[faceId + 1];
				var i2 = indices[faceId + 2];

				var v0 = new BABYLON.Vector3(vertices[i0 * 3], vertices[i0 * 3 + 1], vertices[i0 * 3 + 2]);
				var v1 = new BABYLON.Vector3(vertices[i1 * 3], vertices[i1 * 3 + 1], vertices[i1 * 3 + 2]);
				var v2 = new BABYLON.Vector3(vertices[i2 * 3], vertices[i2 * 3 + 1], vertices[i2 * 3 + 2]);

				var uv0 = new BABYLON.Vector2(BABYLON.Vector3.Dot(v0, dirVectors[i][0]), BABYLON.Vector3.Dot(v0, dirVectors[i][1]));
				var uv1 = new BABYLON.Vector2(BABYLON.Vector3.Dot(v1, dirVectors[i][0]), BABYLON.Vector3.Dot(v1, dirVectors[i][1]));
				var uv2 = new BABYLON.Vector2(BABYLON.Vector3.Dot(v2, dirVectors[i][0]), BABYLON.Vector3.Dot(v2, dirVectors[i][1]));
				result[i][j].push({ uv : uv0, index : i0 }, { uv : uv1, index: i1 }, { uv : uv2, index: i2 });
			}
		}
	}

	return result;
}


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

	for (var i = 0; i < this.faces.length; i++) {
		otherBatch.faces.push(this.faces[i]);
		var i0 = indices[this.faces[i]*3];
		var i1 = indices[this.faces[i]*3 + 1];
		var i2 = indices[this.faces[i]*3 + 2];
		batchCache[i0] = otherBatch;
		batchCache[i1] = otherBatch;
		batchCache[i2] = otherBatch;
	}
	this.faces.length = 0;
};

FaceBatch.ID = 0;

var pushFace = function(directions, directionId, batchCache, faceId, i0, i1, i2, vertices, indices) {
	var batch;
	var tempFace = [i0, i1, i2];

	if (batchCache[i0] === undefined && batchCache[i1] === undefined && batchCache[i2] === undefined) {
		batch = new FaceBatch();
		directions[directionId].push(batch);
		batch.directionId = directionId;
	} else {
		for (var i = 0; i < 3 ; i++) {
			if (batchCache[tempFace[i]] !== undefined) {
				// tempFace[i] already has a batch, we check it's the same direction
				if (batchCache[tempFace[i]].directionId !== directionId) {
					// It's not, we have to duplicate the vertex
					var vertex = new BABYLON.Vector3(vertices[tempFace[i] * 3], vertices[tempFace[i] * 3 + 1], vertices[tempFace[i] * 3 + 2]);
					vertices.push(vertex.x, vertex.y, vertex.z);
					indices[faceId * 3 + i] = vertices.length / 3 - 1;
					tempFace[i] = indices[faceId * 3 + i]

					console.log("vertex duplication");

					// and create a new batch
					if (!batch) {
						batch = new FaceBatch();
						directions[directionId].push(batch);
						batch.directionId = directionId;
					}
				} else {
					// It is ! we can use this facebatch to make connexity
					// But if we already have a batch, we can merge them
					if (batch) {
						batchCache[tempFace[i]].mergeInto(batch, batchCache, indices);
						if (batch !== batchCache[tempFace[i]]) {
							directions[directionId].splice(directions[directionId].indexOf(batchCache[tempFace[i]]), 1);
						}
					} else {
						batch = batchCache[tempFace[i]];
					}
				}
			}
		}
	}

	batchCache[tempFace[0]] = batch;
	batchCache[tempFace[1]] = batch;
	batchCache[tempFace[2]] = batch;
	batch.faces.push(faceId);
};

var sortFacesByNormal = function(vertices, indices) {
	var directions = [
		[], // px
		[], // nx
		[], // py
		[], // ny
		[], // pz
		[], // nz
	];

	var batchCache = [];

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

		if (Math.abs(normal.x) > Math.abs(normal.y) && Math.abs(normal.x) > Math.abs(normal.z)) {
			if (normal.x >= 0) {
				// Positive x
				pushFace(directions, 0, batchCache, i, i0, i1, i2, vertices, indices)
			} else {
				// Negative x
				pushFace(directions, 1, batchCache, i, i0, i1, i2, vertices, indices)

			}
		} else if (Math.abs(normal.y) > Math.abs(normal.x) && Math.abs(normal.y) > Math.abs(normal.z)) {
			if (normal.y >= 0) {
				// Positive y
				pushFace(directions, 2, batchCache, i, i0, i1, i2, vertices, indices)
			} else {
				// Negative y
				pushFace(directions, 3, batchCache, i, i0, i1, i2, vertices, indices)
			}
		} else if (Math.abs(normal.z) > Math.abs(normal.x) && Math.abs(normal.z) > Math.abs(normal.y)) {
			if (normal.z >= 0) {
				// Positive z
				pushFace(directions, 4, batchCache, i, i0, i1, i2, vertices, indices)
			} else {
				// Negative z
				pushFace(directions, 5, batchCache, i, i0, i1, i2, vertices, indices)
			}
		}
	}

	return directions;
}