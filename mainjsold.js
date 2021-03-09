// import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.118/build/three.module.js';
import * as THREE from './build/three.module.js';
import {FBXLoader} from './jsm/loaders/FBXLoader.js';
// import {FBXLoader} from 'https://cdn.jsdelivr.net/npm/three@0.118.1/examples/jsm/loaders/FBXLoader.js';
// import TWEEN from 'https://cdn.jsdelivr.net/npm/@tweenjs/tween.js@18.5.0/dist/tween.esm.js';
import { HorizontalBlurShader } from './jsm/shaders/HorizontalBlurShader.js';
import { VerticalBlurShader } from './jsm/shaders/VerticalBlurShader.js';

import Stats from './jsm/libs/stats.module.js';
import { GUI } from './jsm/libs/dat.gui.module.js';


// phisijs start


window.Physijs = (function() {
	'use strict';

	var SUPPORT_TRANSFERABLE,
		_is_simulating = false,
		_Physijs = Physijs, // used for noConflict method
		Physijs = {}, // object assigned to window.Physijs
		Eventable, // class to provide simple event methods
		getObjectId, // returns a unique ID for a Physijs mesh object
		getEulerXYZFromQuaternion, getQuatertionFromEuler,
		convertWorldPositionToObject, // Converts a world-space position to object-space
		addObjectChildren,

		_temp1, _temp2,
		_temp_vector3_1 = new THREE.Vector3,
		_temp_vector3_2 = new THREE.Vector3,
		_temp_matrix4_1 = new THREE.Matrix4,
		_quaternion_1 = new THREE.Quaternion,

		// constants
		MESSAGE_TYPES = {
			WORLDREPORT: 0,
			COLLISIONREPORT: 1,
			VEHICLEREPORT: 2,
			CONSTRAINTREPORT: 3
		},
		REPORT_ITEMSIZE = 14,
		COLLISIONREPORT_ITEMSIZE = 5,
		VEHICLEREPORT_ITEMSIZE = 9,
		CONSTRAINTREPORT_ITEMSIZE = 6;

	Physijs.scripts = {};

	Eventable = function() {
		this._eventListeners = {};
	};
	Eventable.prototype.addEventListener = function( event_name, callback ) {
		if ( !this._eventListeners.hasOwnProperty( event_name ) ) {
			this._eventListeners[event_name] = [];
		}
		this._eventListeners[event_name].push( callback );
	};
	Eventable.prototype.removeEventListener = function( event_name, callback ) {
		var index;

		if ( !this._eventListeners.hasOwnProperty( event_name ) ) return false;

		if ( (index = this._eventListeners[event_name].indexOf( callback )) >= 0 ) {
			this._eventListeners[event_name].splice( index, 1 );
			return true;
		}

		return false;
	};
	Eventable.prototype.dispatchEvent = function( event_name ) {
		var i,
			parameters = Array.prototype.splice.call( arguments, 1 );

		if ( this._eventListeners.hasOwnProperty( event_name ) ) {
			for ( i = 0; i < this._eventListeners[event_name].length; i++ ) {
				this._eventListeners[event_name][i].apply( this, parameters );
			}
		}
	};
	Eventable.make = function( obj ) {
		obj.prototype.addEventListener = Eventable.prototype.addEventListener;
		obj.prototype.removeEventListener = Eventable.prototype.removeEventListener;
		obj.prototype.dispatchEvent = Eventable.prototype.dispatchEvent;
	};

	getObjectId = (function() {
		var _id = 1;
		return function() {
			return _id++;
		};
	})();

	getEulerXYZFromQuaternion = function ( x, y, z, w ) {
		return new THREE.Vector3(
			Math.atan2( 2 * ( x * w - y * z ), ( w * w - x * x - y * y + z * z ) ),
			Math.asin( 2 *  ( x * z + y * w ) ),
			Math.atan2( 2 * ( z * w - x * y ), ( w * w + x * x - y * y - z * z ) )
		);
	};

	getQuatertionFromEuler = function( x, y, z ) {
		var c1, s1, c2, s2, c3, s3, c1c2, s1s2;
		c1 = Math.cos( y  );
		s1 = Math.sin( y  );
		c2 = Math.cos( -z );
		s2 = Math.sin( -z );
		c3 = Math.cos( x  );
		s3 = Math.sin( x  );

		c1c2 = c1 * c2;
		s1s2 = s1 * s2;

		return {
			w: c1c2 * c3  - s1s2 * s3,
			x: c1c2 * s3  + s1s2 * c3,
			y: s1 * c2 * c3 + c1 * s2 * s3,
			z: c1 * s2 * c3 - s1 * c2 * s3
		};
	};

	convertWorldPositionToObject = function( position, object ) {
		_temp_matrix4_1.identity(); // reset temp matrix

		// Set the temp matrix's rotation to the object's rotation
		_temp_matrix4_1.identity().makeRotationFromQuaternion( object.quaternion );

		// Invert rotation matrix in order to "unrotate" a point back to object space
		_temp_matrix4_1.getInverse( _temp_matrix4_1 );

		// Yay! Temp vars!
		_temp_vector3_1.copy( position );
		_temp_vector3_2.copy( object.position );

		// Apply the rotation

		return _temp_vector3_1.sub( _temp_vector3_2 ).applyMatrix4( _temp_matrix4_1 );
	};



	// Physijs.noConflict
	Physijs.noConflict = function() {
		window.Physijs = _Physijs;
		return Physijs;
	};


	// Physijs.createMaterial
	Physijs.createMaterial = function( material, friction, restitution ) {
		var physijs_material = function(){};
		physijs_material.prototype = material;
		physijs_material = new physijs_material;

		physijs_material._physijs = {
			id: material.id,
			friction: friction === undefined ? .8 : friction,
			restitution: restitution === undefined ? .2 : restitution
		};

		return physijs_material;
	};


	// Constraints
	Physijs.PointConstraint = function( objecta, objectb, position ) {
		if ( position === undefined ) {
			position = objectb;
			objectb = undefined;
		}

		this.type = 'point';
		this.appliedImpulse = 0;
		this.id = getObjectId();
		this.objecta = objecta._physijs.id;
		this.positiona = convertWorldPositionToObject( position, objecta ).clone();

		if ( objectb ) {
			this.objectb = objectb._physijs.id;
			this.positionb = convertWorldPositionToObject( position, objectb ).clone();
		}
	};
	Physijs.PointConstraint.prototype.getDefinition = function() {
		return {
			type: this.type,
			id: this.id,
			objecta: this.objecta,
			objectb: this.objectb,
			positiona: this.positiona,
			positionb: this.positionb
		};
	};

	Physijs.HingeConstraint = function( objecta, objectb, position, axis ) {
		if ( axis === undefined ) {
			axis = position;
			position = objectb;
			objectb = undefined;
		}

		this.type = 'hinge';
		this.appliedImpulse = 0;
		this.id = getObjectId();
		this.scene = objecta.parent;
		this.objecta = objecta._physijs.id;
		this.positiona = convertWorldPositionToObject( position, objecta ).clone();
		this.position = position.clone();
		this.axis = axis;

		if ( objectb ) {
			this.objectb = objectb._physijs.id;
			this.positionb = convertWorldPositionToObject( position, objectb ).clone();
		}
	};
	Physijs.HingeConstraint.prototype.getDefinition = function() {
		return {
			type: this.type,
			id: this.id,
			objecta: this.objecta,
			objectb: this.objectb,
			positiona: this.positiona,
			positionb: this.positionb,
			axis: this.axis
		};
	};
	/*
	 * low = minimum angle in radians
	 * high = maximum angle in radians
	 * bias_factor = applied as a factor to constraint error
	 * relaxation_factor = controls bounce (0.0 == no bounce)
	 */
	Physijs.HingeConstraint.prototype.setLimits = function( low, high, bias_factor, relaxation_factor ) {
		this.scene.execute( 'hinge_setLimits', { constraint: this.id, low: low, high: high, bias_factor: bias_factor, relaxation_factor: relaxation_factor } );
	};
	Physijs.HingeConstraint.prototype.enableAngularMotor = function( velocity, acceleration ) {
		this.scene.execute( 'hinge_enableAngularMotor', { constraint: this.id, velocity: velocity, acceleration: acceleration } );
	};
	Physijs.HingeConstraint.prototype.disableMotor = function( velocity, acceleration ) {
		this.scene.execute( 'hinge_disableMotor', { constraint: this.id } );
	};

	Physijs.SliderConstraint = function( objecta, objectb, position, axis ) {
		if ( axis === undefined ) {
			axis = position;
			position = objectb;
			objectb = undefined;
		}

		this.type = 'slider';
		this.appliedImpulse = 0;
		this.id = getObjectId();
		this.scene = objecta.parent;
		this.objecta = objecta._physijs.id;
		this.positiona = convertWorldPositionToObject( position, objecta ).clone();
		this.axis = axis;

		if ( objectb ) {
			this.objectb = objectb._physijs.id;
			this.positionb = convertWorldPositionToObject( position, objectb ).clone();
		}
	};
	Physijs.SliderConstraint.prototype.getDefinition = function() {
		return {
			type: this.type,
			id: this.id,
			objecta: this.objecta,
			objectb: this.objectb,
			positiona: this.positiona,
			positionb: this.positionb,
			axis: this.axis
		};
	};
	Physijs.SliderConstraint.prototype.setLimits = function( lin_lower, lin_upper, ang_lower, ang_upper ) {
		this.scene.execute( 'slider_setLimits', { constraint: this.id, lin_lower: lin_lower, lin_upper: lin_upper, ang_lower: ang_lower, ang_upper: ang_upper } );
	};
	Physijs.SliderConstraint.prototype.setRestitution = function( linear, angular ) {
		this.scene.execute(
			'slider_setRestitution',
			{
				constraint: this.id,
				linear: linear,
				angular: angular
			}
		);
	};
	Physijs.SliderConstraint.prototype.enableLinearMotor = function( velocity, acceleration) {
		this.scene.execute( 'slider_enableLinearMotor', { constraint: this.id, velocity: velocity, acceleration: acceleration } );
	};
	Physijs.SliderConstraint.prototype.disableLinearMotor = function() {
		this.scene.execute( 'slider_disableLinearMotor', { constraint: this.id } );
	};
	Physijs.SliderConstraint.prototype.enableAngularMotor = function( velocity, acceleration ) {
		this.scene.execute( 'slider_enableAngularMotor', { constraint: this.id, velocity: velocity, acceleration: acceleration } );
	};
	Physijs.SliderConstraint.prototype.disableAngularMotor = function() {
		this.scene.execute( 'slider_disableAngularMotor', { constraint: this.id } );
	};

	Physijs.ConeTwistConstraint = function( objecta, objectb, position ) {
		if ( position === undefined ) {
			throw 'Both objects must be defined in a ConeTwistConstraint.';
		}
		this.type = 'conetwist';
		this.appliedImpulse = 0;
		this.id = getObjectId();
		this.scene = objecta.parent;
		this.objecta = objecta._physijs.id;
		this.positiona = convertWorldPositionToObject( position, objecta ).clone();
		this.objectb = objectb._physijs.id;
		this.positionb = convertWorldPositionToObject( position, objectb ).clone();
		this.axisa = { x: objecta.rotation.x, y: objecta.rotation.y, z: objecta.rotation.z };
		this.axisb = { x: objectb.rotation.x, y: objectb.rotation.y, z: objectb.rotation.z };
	};
	Physijs.ConeTwistConstraint.prototype.getDefinition = function() {
		return {
			type: this.type,
			id: this.id,
			objecta: this.objecta,
			objectb: this.objectb,
			positiona: this.positiona,
			positionb: this.positionb,
			axisa: this.axisa,
			axisb: this.axisb
		};
	};
	Physijs.ConeTwistConstraint.prototype.setLimit = function( x, y, z ) {
		this.scene.execute( 'conetwist_setLimit', { constraint: this.id, x: x, y: y, z: z } );
	};
	Physijs.ConeTwistConstraint.prototype.enableMotor = function() {
		this.scene.execute( 'conetwist_enableMotor', { constraint: this.id } );
	};
	Physijs.ConeTwistConstraint.prototype.setMaxMotorImpulse = function( max_impulse ) {
		this.scene.execute( 'conetwist_setMaxMotorImpulse', { constraint: this.id, max_impulse: max_impulse } );
	};
	Physijs.ConeTwistConstraint.prototype.setMotorTarget = function( target ) {
		if ( target instanceof THREE.Vector3 ) {
			target = new THREE.Quaternion().setFromEuler( new THREE.Euler( target.x, target.y, target.z ) );
		} else if ( target instanceof THREE.Euler ) {
			target = new THREE.Quaternion().setFromEuler( target );
		} else if ( target instanceof THREE.Matrix4 ) {
			target = new THREE.Quaternion().setFromRotationMatrix( target );
		}
		this.scene.execute( 'conetwist_setMotorTarget', { constraint: this.id, x: target.x, y: target.y, z: target.z, w: target.w } );
	};
	Physijs.ConeTwistConstraint.prototype.disableMotor = function() {
		this.scene.execute( 'conetwist_disableMotor', { constraint: this.id } );
	};

	Physijs.DOFConstraint = function( objecta, objectb, position ) {
		if ( position === undefined ) {
			position = objectb;
			objectb = undefined;
		}
		this.type = 'dof';
		this.appliedImpulse = 0;
		this.id = getObjectId();
		this.scene = objecta.parent;
		this.objecta = objecta._physijs.id;
		this.positiona = convertWorldPositionToObject( position, objecta ).clone();
		this.axisa = { x: objecta.rotation.x, y: objecta.rotation.y, z: objecta.rotation.z };

		if ( objectb ) {
			this.objectb = objectb._physijs.id;
			this.positionb = convertWorldPositionToObject( position, objectb ).clone();
			this.axisb = { x: objectb.rotation.x, y: objectb.rotation.y, z: objectb.rotation.z };
		}
	};
	Physijs.DOFConstraint.prototype.getDefinition = function() {
		return {
			type: this.type,
			id: this.id,
			objecta: this.objecta,
			objectb: this.objectb,
			positiona: this.positiona,
			positionb: this.positionb,
			axisa: this.axisa,
			axisb: this.axisb
		};
	};
	Physijs.DOFConstraint.prototype.setLinearLowerLimit = function( limit ) {
		this.scene.execute( 'dof_setLinearLowerLimit', { constraint: this.id, x: limit.x, y: limit.y, z: limit.z } );
	};
	Physijs.DOFConstraint.prototype.setLinearUpperLimit = function( limit ) {
		this.scene.execute( 'dof_setLinearUpperLimit', { constraint: this.id, x: limit.x, y: limit.y, z: limit.z } );
	};
	Physijs.DOFConstraint.prototype.setAngularLowerLimit = function( limit ) {
		this.scene.execute( 'dof_setAngularLowerLimit', { constraint: this.id, x: limit.x, y: limit.y, z: limit.z } );
	};
	Physijs.DOFConstraint.prototype.setAngularUpperLimit = function( limit ) {
		this.scene.execute( 'dof_setAngularUpperLimit', { constraint: this.id, x: limit.x, y: limit.y, z: limit.z } );
	};
	Physijs.DOFConstraint.prototype.enableAngularMotor = function( which ) {
		this.scene.execute( 'dof_enableAngularMotor', { constraint: this.id, which: which } );
	};
	Physijs.DOFConstraint.prototype.configureAngularMotor = function( which, low_angle, high_angle, velocity, max_force ) {
		this.scene.execute( 'dof_configureAngularMotor', { constraint: this.id, which: which, low_angle: low_angle, high_angle: high_angle, velocity: velocity, max_force: max_force } );
	};
	Physijs.DOFConstraint.prototype.disableAngularMotor = function( which ) {
		this.scene.execute( 'dof_disableAngularMotor', { constraint: this.id, which: which } );
	};

	// Physijs.Scene
	Physijs.Scene = function( params ) {
		var self = this;

		Eventable.call( this );
		THREE.Scene.call( this );

		this._worker = new Worker( Physijs.scripts.worker || 'physijs_worker.js' );
		this._worker.transferableMessage = this._worker.webkitPostMessage || this._worker.postMessage;
		this._materials_ref_counts = {};
		this._objects = {};
		this._vehicles = {};
		this._constraints = {};

		var ab = new ArrayBuffer( 1 );
		this._worker.transferableMessage( ab, [ab] );
		SUPPORT_TRANSFERABLE = ( ab.byteLength === 0 );

		this._worker.onmessage = function ( event ) {
			var _temp,
				data = event.data;

			if ( data instanceof ArrayBuffer && data.byteLength !== 1 ) { // byteLength === 1 is the worker making a SUPPORT_TRANSFERABLE test
				data = new Float32Array( data );
			}

			if ( data instanceof Float32Array ) {

				// transferable object
				switch ( data[0] ) {
					case MESSAGE_TYPES.WORLDREPORT:
						self._updateScene( data );
						break;

					case MESSAGE_TYPES.COLLISIONREPORT:
						self._updateCollisions( data );
						break;

					case MESSAGE_TYPES.VEHICLEREPORT:
						self._updateVehicles( data );
						break;

					case MESSAGE_TYPES.CONSTRAINTREPORT:
						self._updateConstraints( data );
						break;
				}

			} else {

				if ( data.cmd ) {

					// non-transferable object
					switch ( data.cmd ) {
						case 'objectReady':
							_temp = data.params;
							if ( self._objects[ _temp ] ) {
								self._objects[ _temp ].dispatchEvent( 'ready' );
							}
							break;

						case 'worldReady':
							self.dispatchEvent( 'ready' );
							break;

						case 'vehicle':
							window.test = data;
							break;

						default:
							// Do nothing, just show the message
							console.debug('Received: ' + data.cmd);
							console.dir(data.params);
							break;
					}

				} else {

					switch ( data[0] ) {
						case MESSAGE_TYPES.WORLDREPORT:
							self._updateScene( data );
							break;

						case MESSAGE_TYPES.COLLISIONREPORT:
							self._updateCollisions( data );
							break;

						case MESSAGE_TYPES.VEHICLEREPORT:
							self._updateVehicles( data );
							break;

						case MESSAGE_TYPES.CONSTRAINTREPORT:
							self._updateConstraints( data );
							break;
					}

				}

			}
		};


		params = params || {};
		params.ammo = Physijs.scripts.ammo || 'ammo.js';
		params.fixedTimeStep = params.fixedTimeStep || 1 / 60;
		params.rateLimit = params.rateLimit || true;
		this.execute( 'init', params );
	};
	Physijs.Scene.prototype = new THREE.Scene;
	Physijs.Scene.prototype.constructor = Physijs.Scene;
	Eventable.make( Physijs.Scene );

	Physijs.Scene.prototype._updateScene = function( data ) {
		var num_objects = data[1],
			object,
			i, offset;

		for ( i = 0; i < num_objects; i++ ) {
			offset = 2 + i * REPORT_ITEMSIZE;
			object = this._objects[ data[ offset ] ];

			if ( object === undefined ) {
				continue;
			}

			if ( object.__dirtyPosition === false ) {
				object.position.set(
					data[ offset + 1 ],
					data[ offset + 2 ],
					data[ offset + 3 ]
				);
			}

			if ( object.__dirtyRotation === false ) {
				object.quaternion.set(
					data[ offset + 4 ],
					data[ offset + 5 ],
					data[ offset + 6 ],
					data[ offset + 7 ]
				);
			}

			object._physijs.linearVelocity.set(
				data[ offset + 8 ],
				data[ offset + 9 ],
				data[ offset + 10 ]
			);

			object._physijs.angularVelocity.set(
				data[ offset + 11 ],
				data[ offset + 12 ],
				data[ offset + 13 ]
			);

		}

		if ( SUPPORT_TRANSFERABLE ) {
			// Give the typed array back to the worker
			this._worker.transferableMessage( data.buffer, [data.buffer] );
		}

		_is_simulating = false;
		this.dispatchEvent( 'update' );
	};

	Physijs.Scene.prototype._updateVehicles = function( data ) {
		var vehicle, wheel,
			i, offset;

		for ( i = 0; i < ( data.length - 1 ) / VEHICLEREPORT_ITEMSIZE; i++ ) {
			offset = 1 + i * VEHICLEREPORT_ITEMSIZE;
			vehicle = this._vehicles[ data[ offset ] ];

			if ( vehicle === undefined ) {
				continue;
			}

			wheel = vehicle.wheels[ data[ offset + 1 ] ];

			wheel.position.set(
				data[ offset + 2 ],
				data[ offset + 3 ],
				data[ offset + 4 ]
			);

			wheel.quaternion.set(
				data[ offset + 5 ],
				data[ offset + 6 ],
				data[ offset + 7 ],
				data[ offset + 8 ]
			);
		}

		if ( SUPPORT_TRANSFERABLE ) {
			// Give the typed array back to the worker
			this._worker.transferableMessage( data.buffer, [data.buffer] );
		}
	};

	Physijs.Scene.prototype._updateConstraints = function( data ) {
		var constraint, object,
			i, offset;

		for ( i = 0; i < ( data.length - 1 ) / CONSTRAINTREPORT_ITEMSIZE; i++ ) {
			offset = 1 + i * CONSTRAINTREPORT_ITEMSIZE;
			constraint = this._constraints[ data[ offset ] ];
			object = this._objects[ data[ offset + 1 ] ];

			if ( constraint === undefined || object === undefined ) {
				continue;
			}

			_temp_vector3_1.set(
				data[ offset + 2 ],
				data[ offset + 3 ],
				data[ offset + 4 ]
			);
			_temp_matrix4_1.extractRotation( object.matrix );
			_temp_vector3_1.applyMatrix4( _temp_matrix4_1 );

			constraint.positiona.addVectors( object.position, _temp_vector3_1 );
			constraint.appliedImpulse = data[ offset + 5 ] ;
		}

		if ( SUPPORT_TRANSFERABLE ) {
			// Give the typed array back to the worker
			this._worker.transferableMessage( data.buffer, [data.buffer] );
		}
	};

	Physijs.Scene.prototype._updateCollisions = function( data ) {
		/**
		 * #TODO
		 * This is probably the worst way ever to handle collisions. The inherent evilness is a residual
		 * effect from the previous version's evilness which mutated when switching to transferable objects.
		 *
		 * If you feel inclined to make this better, please do so.
		 */

		var i, j, offset, object, object2, id1, id2,
			collisions = {}, normal_offsets = {};

		// Build collision manifest
		for ( i = 0; i < data[1]; i++ ) {
			offset = 2 + i * COLLISIONREPORT_ITEMSIZE;
			object = data[ offset ];
			object2 = data[ offset + 1 ];

			normal_offsets[ object + '-' + object2 ] = offset + 2;
			normal_offsets[ object2 + '-' + object ] = -1 * ( offset + 2 );

			// Register collisions for both the object colliding and the object being collided with
			if ( !collisions[ object ] ) collisions[ object ] = [];
			collisions[ object ].push( object2 );

			if ( !collisions[ object2 ] ) collisions[ object2 ] = [];
			collisions[ object2 ].push( object );
		}

		// Deal with collisions
		for ( id1 in this._objects ) {
			if ( !this._objects.hasOwnProperty( id1 ) ) continue;
			object = this._objects[ id1 ];

			// If object touches anything, ...
			if ( collisions[ id1 ] ) {

				// Clean up touches array
				for ( j = 0; j < object._physijs.touches.length; j++ ) {
					if ( collisions[ id1 ].indexOf( object._physijs.touches[j] ) === -1 ) {
						object._physijs.touches.splice( j--, 1 );
					}
				}

				// Handle each colliding object
				for ( j = 0; j < collisions[ id1 ].length; j++ ) {
					id2 = collisions[ id1 ][ j ];
					object2 = this._objects[ id2 ];

					if ( object2 ) {
						// If object was not already touching object2, notify object
						if ( object._physijs.touches.indexOf( id2 ) === -1 ) {
							object._physijs.touches.push( id2 );

							_temp_vector3_1.subVectors( object.getLinearVelocity(), object2.getLinearVelocity() );
							_temp1 = _temp_vector3_1.clone();

							_temp_vector3_1.subVectors( object.getAngularVelocity(), object2.getAngularVelocity() );
							_temp2 = _temp_vector3_1.clone();

							var normal_offset = normal_offsets[ object._physijs.id + '-' + object2._physijs.id ];
							if ( normal_offset > 0 ) {
								_temp_vector3_1.set(
									-data[ normal_offset ],
									-data[ normal_offset + 1 ],
									-data[ normal_offset + 2 ]
								);
							} else {
								normal_offset *= -1;
								_temp_vector3_1.set(
									data[ normal_offset ],
									data[ normal_offset + 1 ],
									data[ normal_offset + 2 ]
								);
							}

							object.dispatchEvent( 'collision', object2, _temp1, _temp2, _temp_vector3_1 );
						}
					}
				}

			} else {

				// not touching other objects
				object._physijs.touches.length = 0;

			}

		}

		this.collisions = collisions;

		if ( SUPPORT_TRANSFERABLE ) {
			// Give the typed array back to the worker
			this._worker.transferableMessage( data.buffer, [data.buffer] );
		}
	};

	Physijs.Scene.prototype.addConstraint = function ( constraint, show_marker ) {
		this._constraints[ constraint.id ] = constraint;
		this.execute( 'addConstraint', constraint.getDefinition() );

		if ( show_marker ) {
			var marker;

			switch ( constraint.type ) {
				case 'point':
					marker = new THREE.Mesh(
						new THREE.SphereGeometry( 1.5 ),
						new THREE.MeshNormalMaterial
					);
					marker.position.copy( constraint.positiona );
					this._objects[ constraint.objecta ].add( marker );
					break;

				case 'hinge':
					marker = new THREE.Mesh(
						new THREE.SphereGeometry( 1.5 ),
						new THREE.MeshNormalMaterial
					);
					marker.position.copy( constraint.positiona );
					this._objects[ constraint.objecta ].add( marker );
					break;

				case 'slider':
					marker = new THREE.Mesh(
						new THREE.CubeGeometry( 10, 1, 1 ),
						new THREE.MeshNormalMaterial
					);
					marker.position.copy( constraint.positiona );
					// This rotation isn't right if all three axis are non-0 values
					// TODO: change marker's rotation order to ZYX
					marker.rotation.set(
						constraint.axis.y, // yes, y and
						constraint.axis.x, // x axis are swapped
						constraint.axis.z
					);
					this._objects[ constraint.objecta ].add( marker );
					break;

				case 'conetwist':
					marker = new THREE.Mesh(
						new THREE.SphereGeometry( 1.5 ),
						new THREE.MeshNormalMaterial
					);
					marker.position.copy( constraint.positiona );
					this._objects[ constraint.objecta ].add( marker );
					break;

				case 'dof':
					marker = new THREE.Mesh(
						new THREE.SphereGeometry( 1.5 ),
						new THREE.MeshNormalMaterial
					);
					marker.position.copy( constraint.positiona );
					this._objects[ constraint.objecta ].add( marker );
					break;
			}
		}

		return constraint;
	};

	Physijs.Scene.prototype.removeConstraint = function( constraint ) {
		if ( this._constraints[constraint.id ] !== undefined ) {
			this.execute( 'removeConstraint', { id: constraint.id } );
			delete this._constraints[ constraint.id ];
		}
	};

	Physijs.Scene.prototype.execute = function( cmd, params ) {
		this._worker.postMessage({ cmd: cmd, params: params });
	};

	addObjectChildren = function( parent, object ) {
		var i;

		for ( i = 0; i < object.children.length; i++ ) {
			if ( object.children[i]._physijs ) {
				object.children[i].updateMatrix();
				object.children[i].updateMatrixWorld();

				_temp_vector3_1.getPositionFromMatrix( object.children[i].matrixWorld );
				_quaternion_1.setFromRotationMatrix( object.children[i].matrixWorld );

				object.children[i]._physijs.position_offset = {
					x: _temp_vector3_1.x,
					y: _temp_vector3_1.y,
					z: _temp_vector3_1.z
				};

				object.children[i]._physijs.rotation = {
					x: _quaternion_1.x,
					y: _quaternion_1.y,
					z: _quaternion_1.z,
					w: _quaternion_1.w
				};

				parent._physijs.children.push( object.children[i]._physijs );
			}

			addObjectChildren( parent, object.children[i] );
		}
	};

	Physijs.Scene.prototype.add = function( object ) {
		THREE.Mesh.prototype.add.call( this, object );

		if ( object._physijs ) {

			object.world = this;

			if ( object instanceof Physijs.Vehicle ) {

				this.add( object.mesh );
				this._vehicles[ object._physijs.id ] = object;
				this.execute( 'addVehicle', object._physijs );

			} else {

				object.__dirtyPosition = false;
				object.__dirtyRotation = false;
				this._objects[object._physijs.id] = object;

				if ( object.children.length ) {
					object._physijs.children = [];
					addObjectChildren( object, object );
				}

				if ( object.material._physijs ) {
					if ( !this._materials_ref_counts.hasOwnProperty( object.material._physijs.id ) ) {
						this.execute( 'registerMaterial', object.material._physijs );
						object._physijs.materialId = object.material._physijs.id;
						this._materials_ref_counts[object.material._physijs.id] = 1;
					} else {
						this._materials_ref_counts[object.material._physijs.id]++;
					}
				}

				// Object starting position + rotation
				object._physijs.position = { x: object.position.x, y: object.position.y, z: object.position.z };
				object._physijs.rotation = { x: object.quaternion.x, y: object.quaternion.y, z: object.quaternion.z, w: object.quaternion.w };

				// Check for scaling
				var mass_scaling = new THREE.Vector3( 1, 1, 1 );
				if ( object._physijs.width ) {
					object._physijs.width *= object.scale.x;
				}
				if ( object._physijs.height ) {
					object._physijs.height *= object.scale.y;
				}
				if ( object._physijs.depth ) {
					object._physijs.depth *= object.scale.z;
				}

				this.execute( 'addObject', object._physijs );

			}
		}
	};

	Physijs.Scene.prototype.remove = function( object ) {
		if ( object instanceof Physijs.Vehicle ) {
			this.execute( 'removeVehicle', { id: object._physijs.id } );
			while( object.wheels.length ) {
				this.remove( object.wheels.pop() );
			}
			this.remove( object.mesh );
			delete this._vehicles[ object._physijs.id ];
		} else {
			THREE.Mesh.prototype.remove.call( this, object );
			if ( object._physijs ) {
				delete this._objects[object._physijs.id];
				this.execute( 'removeObject', { id: object._physijs.id } );
			}
		}
		if ( object.material && object.material._physijs && this._materials_ref_counts.hasOwnProperty( object.material._physijs.id ) ) {
			this._materials_ref_counts[object.material._physijs.id]--;
			if(this._materials_ref_counts[object.material._physijs.id] == 0) {
				this.execute( 'unRegisterMaterial', object.material._physijs );
				delete this._materials_ref_counts[object.material._physijs.id];
			}
		}
	};

	Physijs.Scene.prototype.setFixedTimeStep = function( fixedTimeStep ) {
		if ( fixedTimeStep ) {
			this.execute( 'setFixedTimeStep', fixedTimeStep );
		}
	};

	Physijs.Scene.prototype.setGravity = function( gravity ) {
		if ( gravity ) {
			this.execute( 'setGravity', gravity );
		}
	};

	Physijs.Scene.prototype.simulate = function( timeStep, maxSubSteps ) {
		var object_id, object, update;

		if ( _is_simulating ) {
			return false;
		}

		_is_simulating = true;

		for ( object_id in this._objects ) {
			if ( !this._objects.hasOwnProperty( object_id ) ) continue;

			object = this._objects[object_id];

			if ( object.__dirtyPosition || object.__dirtyRotation ) {
				update = { id: object._physijs.id };

				if ( object.__dirtyPosition ) {
					update.pos = { x: object.position.x, y: object.position.y, z: object.position.z };
					object.__dirtyPosition = false;
				}

				if ( object.__dirtyRotation ) {
					update.quat = { x: object.quaternion.x, y: object.quaternion.y, z: object.quaternion.z, w: object.quaternion.w };
					object.__dirtyRotation = false;
				}

				this.execute( 'updateTransform', update );
			}
		}

		this.execute( 'simulate', { timeStep: timeStep, maxSubSteps: maxSubSteps } );

		return true;
	};


	// Phsijs.Mesh
	Physijs.Mesh = function ( geometry, material, mass ) {
		var index;

		if ( !geometry ) {
			return;
		}

		Eventable.call( this );
		THREE.Mesh.call( this, geometry, material );

		if ( !geometry.boundingBox ) {
			geometry.computeBoundingBox();
		}

		this._physijs = {
			type: null,
			id: getObjectId(),
			mass: mass || 0,
			touches: [],
			linearVelocity: new THREE.Vector3,
			angularVelocity: new THREE.Vector3
		};
	};
	Physijs.Mesh.prototype = new THREE.Mesh;
	Physijs.Mesh.prototype.constructor = Physijs.Mesh;
	Eventable.make( Physijs.Mesh );

	// Physijs.Mesh.mass
	Physijs.Mesh.prototype.__defineGetter__('mass', function() {
		return this._physijs.mass;
	});
	Physijs.Mesh.prototype.__defineSetter__('mass', function( mass ) {
		this._physijs.mass = mass;
		if ( this.world ) {
			this.world.execute( 'updateMass', { id: this._physijs.id, mass: mass } );
		}
	});

	// Physijs.Mesh.applyCentralImpulse
	Physijs.Mesh.prototype.applyCentralImpulse = function ( force ) {
		if ( this.world ) {
			this.world.execute( 'applyCentralImpulse', { id: this._physijs.id, x: force.x, y: force.y, z: force.z } );
		}
	};

	// Physijs.Mesh.applyImpulse
	Physijs.Mesh.prototype.applyImpulse = function ( force, offset ) {
		if ( this.world ) {
			this.world.execute( 'applyImpulse', { id: this._physijs.id, impulse_x: force.x, impulse_y: force.y, impulse_z: force.z, x: offset.x, y: offset.y, z: offset.z } );
		}
	};

	// Physijs.Mesh.applyCentralForce
	Physijs.Mesh.prototype.applyCentralForce = function ( force ) {
		if ( this.world ) {
			this.world.execute( 'applyCentralForce', { id: this._physijs.id, x: force.x, y: force.y, z: force.z } );
		}
	};

	// Physijs.Mesh.applyForce
	Physijs.Mesh.prototype.applyForce = function ( force, offset ) {
		if ( this.world ) {
			this.world.execute( 'applyForce', { id: this._physijs.id, force_x: force.x, force_y : force.y, force_z : force.z, x: offset.x, y: offset.y, z: offset.z } );
		}
	};

	// Physijs.Mesh.getAngularVelocity
	Physijs.Mesh.prototype.getAngularVelocity = function () {
		return this._physijs.angularVelocity;
	};

	// Physijs.Mesh.setAngularVelocity
	Physijs.Mesh.prototype.setAngularVelocity = function ( velocity ) {
		if ( this.world ) {
			this.world.execute( 'setAngularVelocity', { id: this._physijs.id, x: velocity.x, y: velocity.y, z: velocity.z } );
		}
	};

	// Physijs.Mesh.getLinearVelocity
	Physijs.Mesh.prototype.getLinearVelocity = function () {
		return this._physijs.linearVelocity;
	};

	// Physijs.Mesh.setLinearVelocity
	Physijs.Mesh.prototype.setLinearVelocity = function ( velocity ) {
		if ( this.world ) {
			this.world.execute( 'setLinearVelocity', { id: this._physijs.id, x: velocity.x, y: velocity.y, z: velocity.z } );
		}
	};

	// Physijs.Mesh.setAngularFactor
	Physijs.Mesh.prototype.setAngularFactor = function ( factor ) {
		if ( this.world ) {
			this.world.execute( 'setAngularFactor', { id: this._physijs.id, x: factor.x, y: factor.y, z: factor.z } );
		}
	};

	// Physijs.Mesh.setLinearFactor
	Physijs.Mesh.prototype.setLinearFactor = function ( factor ) {
		if ( this.world ) {
			this.world.execute( 'setLinearFactor', { id: this._physijs.id, x: factor.x, y: factor.y, z: factor.z } );
		}
	};

	// Physijs.Mesh.setDamping
	Physijs.Mesh.prototype.setDamping = function ( linear, angular ) {
		if ( this.world ) {
			this.world.execute( 'setDamping', { id: this._physijs.id, linear: linear, angular: angular } );
		}
	};

	// Physijs.Mesh.setCcdMotionThreshold
	Physijs.Mesh.prototype.setCcdMotionThreshold = function ( threshold ) {
		if ( this.world ) {
			this.world.execute( 'setCcdMotionThreshold', { id: this._physijs.id, threshold: threshold } );
		}
	};

	// Physijs.Mesh.setCcdSweptSphereRadius
	Physijs.Mesh.prototype.setCcdSweptSphereRadius = function ( radius ) {
		if ( this.world ) {
			this.world.execute( 'setCcdSweptSphereRadius', { id: this._physijs.id, radius: radius } );
		}
	};


	// Physijs.PlaneMesh
	Physijs.PlaneMesh = function ( geometry, material, mass ) {
		var width, height;

		Physijs.Mesh.call( this, geometry, material, mass );

		if ( !geometry.boundingBox ) {
			geometry.computeBoundingBox();
		}

		width = geometry.boundingBox.max.x - geometry.boundingBox.min.x;
		height = geometry.boundingBox.max.y - geometry.boundingBox.min.y;

		this._physijs.type = 'plane';
		this._physijs.normal = geometry.faces[0].normal.clone();
		this._physijs.mass = (typeof mass === 'undefined') ? width * height : mass;
	};
	Physijs.PlaneMesh.prototype = new Physijs.Mesh;
	Physijs.PlaneMesh.prototype.constructor = Physijs.PlaneMesh;

	// Physijs.HeightfieldMesh
	Physijs.HeightfieldMesh = function ( geometry, material, mass, xdiv, ydiv) {
		Physijs.Mesh.call( this, geometry, material, mass );

		this._physijs.type   = 'heightfield';
		this._physijs.xsize  = geometry.boundingBox.max.x - geometry.boundingBox.min.x;
		this._physijs.ysize  = geometry.boundingBox.max.y - geometry.boundingBox.min.y;
		this._physijs.xpts = (typeof xdiv === 'undefined') ? Math.sqrt(geometry.vertices.length) : xdiv + 1;
		this._physijs.ypts = (typeof ydiv === 'undefined') ? Math.sqrt(geometry.vertices.length) : ydiv + 1;
		// note - this assumes our plane geometry is square, unless we pass in specific xdiv and ydiv
		this._physijs.absMaxHeight = Math.max(geometry.boundingBox.max.z,Math.abs(geometry.boundingBox.min.z));

		var points = [];

		var a, b;
		for ( var i = 0; i < geometry.vertices.length; i++ ) {

			a = i % this._physijs.xpts;
			b = Math.round( ( i / this._physijs.xpts ) - ( (i % this._physijs.xpts) / this._physijs.xpts ) );
			points[i] = geometry.vertices[ a + ( ( this._physijs.ypts - b - 1 ) * this._physijs.ypts ) ].z;

			//points[i] = geometry.vertices[i];
		}

		this._physijs.points = points;
	};
	Physijs.HeightfieldMesh.prototype = new Physijs.Mesh;
	Physijs.HeightfieldMesh.prototype.constructor = Physijs.HeightfieldMesh;

	// Physijs.BoxMesh
	Physijs.BoxMesh = function( geometry, material, mass ) {
		var width, height, depth;

		Physijs.Mesh.call( this, geometry, material, mass );

		if ( !geometry.boundingBox ) {
			geometry.computeBoundingBox();
		}

		width = geometry.boundingBox.max.x - geometry.boundingBox.min.x;
		height = geometry.boundingBox.max.y - geometry.boundingBox.min.y;
		depth = geometry.boundingBox.max.z - geometry.boundingBox.min.z;

		this._physijs.type = 'box';
		this._physijs.width = width;
		this._physijs.height = height;
		this._physijs.depth = depth;
		this._physijs.mass = (typeof mass === 'undefined') ? width * height * depth : mass;
	};
	Physijs.BoxMesh.prototype = new Physijs.Mesh;
	Physijs.BoxMesh.prototype.constructor = Physijs.BoxMesh;


	// Physijs.SphereMesh
	Physijs.SphereMesh = function( geometry, material, mass ) {
		Physijs.Mesh.call( this, geometry, material, mass );

		if ( !geometry.boundingSphere ) {
			geometry.computeBoundingSphere();
		}

		this._physijs.type = 'sphere';
		this._physijs.radius = geometry.boundingSphere.radius;
		this._physijs.mass = (typeof mass === 'undefined') ? (4/3) * Math.PI * Math.pow(this._physijs.radius, 3) : mass;
	};
	Physijs.SphereMesh.prototype = new Physijs.Mesh;
	Physijs.SphereMesh.prototype.constructor = Physijs.SphereMesh;


	// Physijs.CylinderMesh
	Physijs.CylinderMesh = function( geometry, material, mass ) {
		var width, height, depth;

		Physijs.Mesh.call( this, geometry, material, mass );

		if ( !geometry.boundingBox ) {
			geometry.computeBoundingBox();
		}

		width = geometry.boundingBox.max.x - geometry.boundingBox.min.x;
		height = geometry.boundingBox.max.y - geometry.boundingBox.min.y;
		depth = geometry.boundingBox.max.z - geometry.boundingBox.min.z;

		this._physijs.type = 'cylinder';
		this._physijs.width = width;
		this._physijs.height = height;
		this._physijs.depth = depth;
		this._physijs.mass = (typeof mass === 'undefined') ? width * height * depth : mass;
	};
	Physijs.CylinderMesh.prototype = new Physijs.Mesh;
	Physijs.CylinderMesh.prototype.constructor = Physijs.CylinderMesh;


	// Physijs.CapsuleMesh
	Physijs.CapsuleMesh = function( geometry, material, mass ) {
		var width, height, depth;

		Physijs.Mesh.call( this, geometry, material, mass );

		if ( !geometry.boundingBox ) {
			geometry.computeBoundingBox();
		}

		width = geometry.boundingBox.max.x - geometry.boundingBox.min.x;
		height = geometry.boundingBox.max.y - geometry.boundingBox.min.y;
		depth = geometry.boundingBox.max.z - geometry.boundingBox.min.z;

		this._physijs.type = 'capsule';
		this._physijs.radius = Math.max(width / 2, depth / 2);
		this._physijs.height = height;
		this._physijs.mass = (typeof mass === 'undefined') ? width * height * depth : mass;
	};
	Physijs.CapsuleMesh.prototype = new Physijs.Mesh;
	Physijs.CapsuleMesh.prototype.constructor = Physijs.CapsuleMesh;


	// Physijs.ConeMesh
	Physijs.ConeMesh = function( geometry, material, mass ) {
		var width, height, depth;

		Physijs.Mesh.call( this, geometry, material, mass );

		if ( !geometry.boundingBox ) {
			geometry.computeBoundingBox();
		}

		width = geometry.boundingBox.max.x - geometry.boundingBox.min.x;
		height = geometry.boundingBox.max.y - geometry.boundingBox.min.y;

		this._physijs.type = 'cone';
		this._physijs.radius = width / 2;
		this._physijs.height = height;
		this._physijs.mass = (typeof mass === 'undefined') ? width * height : mass;
	};
	Physijs.ConeMesh.prototype = new Physijs.Mesh;
	Physijs.ConeMesh.prototype.constructor = Physijs.ConeMesh;


	// Physijs.ConcaveMesh
	Physijs.ConcaveMesh = function( geometry, material, mass ) {
		var i,
			width, height, depth,
			vertices, face, triangles = [];

		Physijs.Mesh.call( this, geometry, material, mass );

		if ( !geometry.boundingBox ) {
			geometry.computeBoundingBox();
		}

		vertices = geometry.vertices;

		for ( i = 0; i < geometry.faces.length; i++ ) {
			face = geometry.faces[i];
			if ( face instanceof THREE.Face3) {

				triangles.push([
					{ x: vertices[face.a].x, y: vertices[face.a].y, z: vertices[face.a].z },
					{ x: vertices[face.b].x, y: vertices[face.b].y, z: vertices[face.b].z },
					{ x: vertices[face.c].x, y: vertices[face.c].y, z: vertices[face.c].z }
				]);

			} else if ( face instanceof THREE.Face4 ) {

				triangles.push([
					{ x: vertices[face.a].x, y: vertices[face.a].y, z: vertices[face.a].z },
					{ x: vertices[face.b].x, y: vertices[face.b].y, z: vertices[face.b].z },
					{ x: vertices[face.d].x, y: vertices[face.d].y, z: vertices[face.d].z }
				]);
				triangles.push([
					{ x: vertices[face.b].x, y: vertices[face.b].y, z: vertices[face.b].z },
					{ x: vertices[face.c].x, y: vertices[face.c].y, z: vertices[face.c].z },
					{ x: vertices[face.d].x, y: vertices[face.d].y, z: vertices[face.d].z }
				]);

			}
		}

		width = geometry.boundingBox.max.x - geometry.boundingBox.min.x;
		height = geometry.boundingBox.max.y - geometry.boundingBox.min.y;
		depth = geometry.boundingBox.max.z - geometry.boundingBox.min.z;

		this._physijs.type = 'concave';
		this._physijs.triangles = triangles;
		this._physijs.mass = (typeof mass === 'undefined') ? width * height * depth : mass;
	};
	Physijs.ConcaveMesh.prototype = new Physijs.Mesh;
	Physijs.ConcaveMesh.prototype.constructor = Physijs.ConcaveMesh;


	// Physijs.ConvexMesh
	Physijs.ConvexMesh = function( geometry, material, mass ) {
		var i,
			width, height, depth,
			points = [];

		Physijs.Mesh.call( this, geometry, material, mass );

		if ( !geometry.boundingBox ) {
			geometry.computeBoundingBox();
		}

		for ( i = 0; i < geometry.vertices.length; i++ ) {
			points.push({
				x: geometry.vertices[i].x,
				y: geometry.vertices[i].y,
				z: geometry.vertices[i].z
			});
		}


		width = geometry.boundingBox.max.x - geometry.boundingBox.min.x;
		height = geometry.boundingBox.max.y - geometry.boundingBox.min.y;
		depth = geometry.boundingBox.max.z - geometry.boundingBox.min.z;

		this._physijs.type = 'convex';
		this._physijs.points = points;
		this._physijs.mass = (typeof mass === 'undefined') ? width * height * depth : mass;
	};
	Physijs.ConvexMesh.prototype = new Physijs.Mesh;
	Physijs.ConvexMesh.prototype.constructor = Physijs.ConvexMesh;


	// Physijs.Vehicle
	Physijs.Vehicle = function( mesh, tuning ) {
		tuning = tuning || new Physijs.VehicleTuning;
		this.mesh = mesh;
		this.wheels = [];
		this._physijs = {
			id: getObjectId(),
			rigidBody: mesh._physijs.id,
			suspension_stiffness: tuning.suspension_stiffness,
			suspension_compression: tuning.suspension_compression,
			suspension_damping: tuning.suspension_damping,
			max_suspension_travel: tuning.max_suspension_travel,
			friction_slip: tuning.friction_slip,
			max_suspension_force: tuning.max_suspension_force
		};
	};
	Physijs.Vehicle.prototype.addWheel = function( wheel_geometry, wheel_material, connection_point, wheel_direction, wheel_axle, suspension_rest_length, wheel_radius, is_front_wheel, tuning ) {
		var wheel = new THREE.Mesh( wheel_geometry, wheel_material );
		wheel.castShadow = wheel.receiveShadow = true;
		wheel.position.copy( wheel_direction ).multiplyScalar( suspension_rest_length / 100 ).add( connection_point );
		this.world.add( wheel );
		this.wheels.push( wheel );

		this.world.execute( 'addWheel', {
			id: this._physijs.id,
			connection_point: { x: connection_point.x, y: connection_point.y, z: connection_point.z },
			wheel_direction: { x: wheel_direction.x, y: wheel_direction.y, z: wheel_direction.z },
			wheel_axle: { x: wheel_axle.x, y: wheel_axle.y, z: wheel_axle.z },
			suspension_rest_length: suspension_rest_length,
			wheel_radius: wheel_radius,
			is_front_wheel: is_front_wheel,
			tuning: tuning
		});
	};
	Physijs.Vehicle.prototype.setSteering = function( amount, wheel ) {
		if ( wheel !== undefined && this.wheels[ wheel ] !== undefined ) {
			this.world.execute( 'setSteering', { id: this._physijs.id, wheel: wheel, steering: amount } );
		} else if ( this.wheels.length > 0 ) {
			for ( var i = 0; i < this.wheels.length; i++ ) {
				this.world.execute( 'setSteering', { id: this._physijs.id, wheel: i, steering: amount } );
			}
		}
	};
	Physijs.Vehicle.prototype.setBrake = function( amount, wheel ) {
		if ( wheel !== undefined && this.wheels[ wheel ] !== undefined ) {
			this.world.execute( 'setBrake', { id: this._physijs.id, wheel: wheel, brake: amount } );
		} else if ( this.wheels.length > 0 ) {
			for ( var i = 0; i < this.wheels.length; i++ ) {
				this.world.execute( 'setBrake', { id: this._physijs.id, wheel: i, brake: amount } );
			}
		}
	};
	Physijs.Vehicle.prototype.applyEngineForce = function( amount, wheel ) {
		if ( wheel !== undefined && this.wheels[ wheel ] !== undefined ) {
			this.world.execute( 'applyEngineForce', { id: this._physijs.id, wheel: wheel, force: amount } );
		} else if ( this.wheels.length > 0 ) {
			for ( var i = 0; i < this.wheels.length; i++ ) {
				this.world.execute( 'applyEngineForce', { id: this._physijs.id, wheel: i, force: amount } );
			}
		}
	};

	// Physijs.VehicleTuning
	Physijs.VehicleTuning = function( suspension_stiffness, suspension_compression, suspension_damping, max_suspension_travel, friction_slip, max_suspension_force ) {
		this.suspension_stiffness = suspension_stiffness !== undefined ? suspension_stiffness : 5.88;
		this.suspension_compression = suspension_compression !== undefined ? suspension_compression : 0.83;
		this.suspension_damping = suspension_damping !== undefined ? suspension_damping : 0.88;
		this.max_suspension_travel = max_suspension_travel !== undefined ? max_suspension_travel : 500;
		this.friction_slip = friction_slip !== undefined ? friction_slip : 10.5;
		this.max_suspension_force = max_suspension_force !== undefined ? max_suspension_force : 6000;
	};

	return Physijs;
})();

	Physijs.scripts.worker = './physijs/physijs_worker.js';
	Physijs.scripts.ammo = 'ammo.js'

// PHsijs end

import { EffectComposer } from './jsm/postprocessing/EffectComposer.js';
import { RenderPass } from './jsm/postprocessing/RenderPass.js';
import { ShaderPass } from './jsm/postprocessing/ShaderPass.js';
import { FXAAShader } from './jsm/shaders/FXAAShader.js';



let container;

			let camera, scene, renderer, objectsSphere, stats, objects, checkIfMobile;

            let composer;
			let windowHalfX = window.innerWidth / 2;
            let windowHalfY = window.innerHeight / 2;
            let mouseX = windowHalfX;
            let mouseY = windowHalfY;
			objectsSphere = [];

				window.mobileCheck = function() {
				checkIfMobile = false;
				(function(a){if(/(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|mobile.+firefox|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows ce|xda|xiino/i.test(a)||/1207|6310|6590|3gso|4thp|50[1-6]i|770s|802s|a wa|abac|ac(er|oo|s\-)|ai(ko|rn)|al(av|ca|co)|amoi|an(ex|ny|yw)|aptu|ar(ch|go)|as(te|us)|attw|au(di|\-m|r |s )|avan|be(ck|ll|nq)|bi(lb|rd)|bl(ac|az)|br(e|v)w|bumb|bw\-(n|u)|c55\/|capi|ccwa|cdm\-|cell|chtm|cldc|cmd\-|co(mp|nd)|craw|da(it|ll|ng)|dbte|dc\-s|devi|dica|dmob|do(c|p)o|ds(12|\-d)|el(49|ai)|em(l2|ul)|er(ic|k0)|esl8|ez([4-7]0|os|wa|ze)|fetc|fly(\-|_)|g1 u|g560|gene|gf\-5|g\-mo|go(\.w|od)|gr(ad|un)|haie|hcit|hd\-(m|p|t)|hei\-|hi(pt|ta)|hp( i|ip)|hs\-c|ht(c(\-| |_|a|g|p|s|t)|tp)|hu(aw|tc)|i\-(20|go|ma)|i230|iac( |\-|\/)|ibro|idea|ig01|ikom|im1k|inno|ipaq|iris|ja(t|v)a|jbro|jemu|jigs|kddi|keji|kgt( |\/)|klon|kpt |kwc\-|kyo(c|k)|le(no|xi)|lg( g|\/(k|l|u)|50|54|\-[a-w])|libw|lynx|m1\-w|m3ga|m50\/|ma(te|ui|xo)|mc(01|21|ca)|m\-cr|me(rc|ri)|mi(o8|oa|ts)|mmef|mo(01|02|bi|de|do|t(\-| |o|v)|zz)|mt(50|p1|v )|mwbp|mywa|n10[0-2]|n20[2-3]|n30(0|2)|n50(0|2|5)|n7(0(0|1)|10)|ne((c|m)\-|on|tf|wf|wg|wt)|nok(6|i)|nzph|o2im|op(ti|wv)|oran|owg1|p800|pan(a|d|t)|pdxg|pg(13|\-([1-8]|c))|phil|pire|pl(ay|uc)|pn\-2|po(ck|rt|se)|prox|psio|pt\-g|qa\-a|qc(07|12|21|32|60|\-[2-7]|i\-)|qtek|r380|r600|raks|rim9|ro(ve|zo)|s55\/|sa(ge|ma|mm|ms|ny|va)|sc(01|h\-|oo|p\-)|sdk\/|se(c(\-|0|1)|47|mc|nd|ri)|sgh\-|shar|sie(\-|m)|sk\-0|sl(45|id)|sm(al|ar|b3|it|t5)|so(ft|ny)|sp(01|h\-|v\-|v )|sy(01|mb)|t2(18|50)|t6(00|10|18)|ta(gt|lk)|tcl\-|tdg\-|tel(i|m)|tim\-|t\-mo|to(pl|sh)|ts(70|m\-|m3|m5)|tx\-9|up(\.b|g1|si)|utst|v400|v750|veri|vi(rg|te)|vk(40|5[0-3]|\-v)|vm40|voda|vulc|vx(52|53|60|61|70|80|81|83|85|98)|w3c(\-| )|webc|whit|wi(g |nc|nw)|wmlb|wonu|x700|yas\-|your|zeto|zte\-/i.test(a.substr(0,4))) checkIfMobile = true;})(navigator.userAgent||navigator.vendor||window.opera);
				return checkIfMobile;
			  }
			if(checkIfMobile){
				objects =[{name:"Sphere.5",
			 translation:{x:0.71,
			 y:3.57,
			 z:-3.42, r:0.3}},
			 {name:"Sphere.6",
			 translation:{x:1.47,
			y: 1.34,
			z: -1.87, r:0.2}}
			 ,
			 {name:"Sphere.7",
			 translation:{x:-1.33,
			 y:3.5,
			 z:-2.4, r:0.15}}
			 ,
			 {name:"Sphere.1",
			 translation:{x:-1.29,
			 y:1.66,
			 z:-0.39,r:0.25}}
			 ,
			 {name:"Sphere",
			 translation:{x:1.34,
			 y:2.33,
			 z:-0.39,r:0.3}}

			];
			  } else{
				objects =[
							{name:"Sphere.8",translation:{x:-4,
							 y: 3.57,
							  z:-3.88, r:0.15}},
							  {name:"Sphere.7",
							  translation:{x:-1.33,
							  y:3.57,
							  z:-2.4, r:0.15}}
							  ,
				 				{name:"Sphere.5",
							  translation:{x:0.71,
							  y:3.57,
							  z:-3.42, r:0.3}},
							  {name:"Sphere.10",
							  translation:{x:2.49,
							 y: 3.39,
							 z: -2.81 , r:0.3}

							  },
							  {name:"Sphere.4",
							  translation:{x:2.49,
							  y:2.9,
							  z:-1.53 , r:0.3}},
							  {name:"Sphere.3",
							  translation:{x:-2.04,
							  y:2.78,
							  z:-1.38, r:0.3}}
							  ,
							  {name:"Sphere.6",
							  translation:{x:1.47,
							 y: 1.34,
							 z: -1.87, r:0.2}}
							  ,
							  {name:"Sphere.9",
							  translation:{x:-3.50,
							  y:1.34,
							  z:-0.1,r:0.1}}
							  ,
							  {name:"Sphere.1",
							  translation:{x:-1.29,
							  y:1.66,
							  z:-0.39,r:0.25}}
							  ,
							  {name:"Sphere",
							  translation:{x:1.34,
							  y:2.33,
							  z:-0.39,r:0.3}}
							  ,
							  {
								  name:"Sphere.2",
						  translation:{x:-3.6,
						 y: 2.2,
						  z:-2.62, r:0.3}
							  }
							 ];
			  }




                    // console.log(objects)



					var objectstest = [];
					let group,
					fxaaPass,shader,light7,light_4,loader, overlayui,center


			function init() {

				container = document.createElement( 'div' );
				document.body.appendChild( container );
				container.classList.add("canvas-container");




                camera = new THREE.PerspectiveCamera( 23, window.innerWidth / window.innerHeight, 1, 100 );
                camera.position.x = 0;
    			camera.position.y = 0.9;
    			camera.position.y = 1;

				camera.position.z = 12.8;
				center = new THREE.Vector3(0,0.9,0);
				camera.up = new THREE.Vector3(0, 1, 0);

				camera.lookAt(center);


   /* Init the scene */
   scene = new Physijs.Scene();
   scene.setGravity( new THREE.Vector3( 0, -20, 0));

//    scene.background = new THREE.Color( 0xae1901 )
   scene.background = new THREE.Color( 0x000000 )

// lights
scene.add( new THREE.AmbientLight( 0xF2f2f2, 1.2 ) );
light7 = new THREE.DirectionalLight( 0xffffff, 0.8 );
light7.position.set( 1.2, 4, 4 );

// light_4
light_4 = new THREE.DirectionalLight(0xFfffff, 1.5);

light_4.position.set(-1.6, 4, 4);
light_4.castShadow = light7.castShadow = true;
light_4.shadow.camera.far = light7.shadow.camera.far = 16;

if(checkIfMobile){
	light7.shadow.mapSize.width = light7.shadow.mapSize.height = light_4.shadow.mapSize.width = light_4.shadow.mapSize.height = 190;
}else{
	light_4.shadow.mapSize.width = light7.shadow.mapSize.width = 1920;
	light_4.shadow.mapSize.height = light7.shadow.mapSize.height = 1080;
	superShader();
}

scene.add( light_4 );
scene.add( light7 );

//
function superShader(){
	shader = THREE.ShaderChunk.shadowmap_pars_fragment;

	shader = shader.replace(
	'#ifdef USE_SHADOWMAP',
	'#ifdef USE_SHADOWMAP' +
	document.getElementById( 'PCSS' ).textContent
	);

	shader = shader.replace(
	'#if defined( SHADOWMAP_TYPE_PCF )',
	document.getElementById( 'PCSSGetShadow' ).textContent +
	'#if defined( SHADOWMAP_TYPE_PCF )'
	);

	THREE.ShaderChunk.shadowmap_pars_fragment = shader;
}



// ************************* RENDERER **************************

				renderer = new THREE.WebGLRenderer({
                  });
				  renderer.setPixelRatio( window.devicePixelRatio );
				  renderer.setSize( window.innerWidth, window.innerHeight );

				  renderer.shadowMap.enabled = true;
				  renderer.gammaFactor=2.2;
				  renderer.physicallyCorrectLights = true;
				  renderer.outPutEncoding = THREE.sRGBEncoding;
				  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
				  renderer.shadowMap.CullFace = THREE.CullFaceBack;
				container.appendChild( renderer.domElement );
                renderer.autoClear = false;








// ********************************GROUND***********************

				// let maincolor = new THREE.Color(0xfe2a05)
				let maincolor = new THREE.Color(0x000000)
				maincolor.convertSRGBToLinear();
                var ground_material = Physijs.createMaterial(
                    new THREE.MeshStandardMaterial( {
                        color: maincolor,
                } ),
                    0.5, 0.5
                );
                var ground = new Physijs.BoxMesh( new THREE.BoxGeometry( 19, 0.5, 17 ), ground_material, 0 );
                ground.position.set(-0.61,-1.2,-2.9);
                ground.receiveShadow = true;
                ground.castShadow = true;
				scene.add( ground );


light_4.target = ground;
light7.target = ground;


// loading manager


//  **************************PHONE***************************

overlayui = document.querySelector(".overlayui")
// overlayui.addEventListener("click", ()=> {if(video.currentTime == 0){video.play()}})
let video = document.getElementById( 'video' ),
	texture = new THREE.VideoTexture( video );

	video.onload = function() {

		texture = new THREE.VideoTexture( video );
	}
	let materialphone = new THREE.MeshBasicMaterial( { map: texture } );
loader = new FBXLoader();
loader.load( 'models/fbx/phone (2).fbx', function ( object ) {
	object.traverse( function ( child ) {

		if ( child.isMesh ) {
			child.castShadow = true;
			child.receiveShadow = true;


		}
	} );

	object.scale.set(-0.015,0.015,0.015)
	object.position.set(-2.25,2.5,0)
	if(window.innerWidth < 1240){
		object.position.x = 0;

	}
	scene.add( object );
	object.rotation.z = Math.PI;

	if(video.currentTime == 0){video.play()}
	object.children[1].material[1] = materialphone
	object.children[1].material[0].color = maincolor
	object.children[1].material[1].color = maincolor
	lastlinejs = true;
} );

// *****************************CYLINDER****************

 var ground_material2 = Physijs.createMaterial(
	new THREE.MeshPhongMaterial( {
		color   : maincolor,
		opacity: 0, transparent: true
	} ),
	0, 0
);
	function cylinderHelper(x,y,z,r){
	var ground2 = new Physijs.BoxMesh( new THREE.BoxBufferGeometry( r/2, y+4,0.8 ), ground_material2, 0 );
	ground2.position.set( x-(r) -0.1, 0, z );

	ground2.receiveShadow = false;
	ground2.castShadow = false;


	scene.add( ground2 );
	var ground1 = new Physijs.BoxMesh( new THREE.BoxBufferGeometry( r/2, y+4,0.8 ), ground_material2, 0 );
	ground1.position.set( x+(r)+0.1, 0, z );

	ground1.receiveShadow = false;
	ground1.castShadow = false;


	scene.add( ground1 );


	var ground3 = new Physijs.BoxMesh( new THREE.BoxBufferGeometry( r/2, y+4,0.8 ), ground_material2, 0 );
	ground3.position.set( x, 0, z+(r)+0.1 );
	ground3.rotation.y = Math.PI/2;
	ground3.receiveShadow = false;
	ground3.castShadow = false;


	scene.add( ground3 );
	var ground4 = new Physijs.BoxMesh( new THREE.BoxBufferGeometry( r/2, y+4,0.8 ), ground_material2, 0 );
	ground4.position.set( x, 0, z-(r)-0.1 );
	ground4.rotation.y = Math.PI/2;
	ground4.receiveShadow = false;
	ground4.castShadow = false;


	scene.add( ground4 );


	var ground5 = new Physijs.BoxMesh( new THREE.BoxBufferGeometry( 0.8,0.01,0.8), ground_material2, 0 );
	ground5.position.set( x, y+r+0.05, z );

	ground5.receiveShadow = false;
	ground5.castShadow = false;


	scene.add( ground5 );
}

// spheres
	objects.forEach(object => {

	scene.add(createDrop(object));
	cylinderHelper(object.translation.x,object.translation.y, object.translation.z , object.translation.r);

});



function createDrop(object) {

    var material = Physijs.createMaterial(
        new THREE.MeshStandardMaterial( {
			// color:0xe42304,
			// color:0xff0000,
			color:0x000000,
roughness:0.9,
metalness:0.05,
// emissive:0x991503,
emissive:0x000000,
emissiveIntensity: 0.15

        } ),
        1,1
    );

    /* Create spheres */
    var sphere = new Physijs.SphereMesh(
        new THREE.SphereBufferGeometry( object.translation.r, 20, 20 ),
		material,0.5, 0.5

    );


    sphere.position.set(object.translation.x,object.translation.y, object.translation.z);


    sphere.receiveShadow = true;
    sphere.castShadow = true;



        objectstest.push(sphere);

    return sphere

}


				// postprocessing

			const renderModel = new RenderPass( scene, camera );
			fxaaPass = new ShaderPass( FXAAShader );

			const pixelRatio = renderer.getPixelRatio();

			fxaaPass.material.uniforms[ 'resolution' ].value.x = 1 / ( container.offsetWidth * pixelRatio );
			fxaaPass.material.uniforms[ 'resolution' ].value.y = 1 / ( container.offsetHeight * pixelRatio );

			composer = new EffectComposer( renderer );
			composer.addPass( renderModel );
			composer.addPass( fxaaPass );


			// stats
stats = new Stats();
container.appendChild( stats.dom );

                }





				let middle = document.querySelector(".middle")
			middle.addEventListener("click",()=>{
				reversegravity();
				TEST();
			});
			let left = document.querySelector(".left")
			left.addEventListener("click",()=>{
				reversegravity();
				TEST8();
			});
// function test(){

	// setTimeout(() => {
		// TEST();
		// TEST1();
		// TEST3();

		// reversegravity()

		// setInterval(() => {
			// console.log(objectstest)
			// objectstest[0].activate();
			// reversegravity()
			// TEST();
			// ttout()


	// },8000);



	// }, 4000);
// }
// test();

// mobile ui logic
let btn_toggle, mobile_container, mobile_link, mobile_link_dragged;
btn_toggle = document.querySelector(".toggle-btn")
mobile_container = document.querySelector(".mobile-container")
// drag = document.querySelector(".drag")
mobile_link = document.querySelector(".mobile-link")
// mobile_link_dragged = document.querySelectorAll(".mobile-link-dragged a")
// console.log(mobile_link_dragged)
let mobile_container_after = document.querySelector(".mobile-over")
// now1
btn_toggle.addEventListener("click", ()=>{
	// switch(mobile_container.style.height) {
		// case "":
			// mobile_container.style.height = "50%"
		// 	btn_toggle.style.background = "black"
		// 	btn_toggle.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
		// 	<defs>
		// 		<filter id="lvz8b86wxa">
		// 			<feColorMatrix in="SourceGraphic" values="0 0 0 0 1.000000 0 0 0 0 1.000000 0 0 0 0 1.000000 0 0 0 1.000000 0"/>
		// 		</filter>
		// 	</defs>
		// 	<g fill="none" fill-rule="evenodd">
		// 		<g filter="url(#lvz8b86wxa)">
		// 			<path stroke="#FFF" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6.1 17.757L17.415 6.444m-11.07-.1l11.313 11.313"/>
		// 		</g>
		// 	</g>
		// </svg>`
		// yosik(info2)
		//   break;
		// case "50%":
			mobile_container.style.height = "";
			mobile_container_after.style = "";
			// btn_toggle.style.background = "white"
			// btn_toggle.innerHTML = "m"
			// yosik(info2)
			// if(mobile_container.classList.contains("dragged-height")){
			// 	mobile_container.classList.remove("dragged-height")
			// 	resetZmobile()
			// }


	//   }
})

// drag.addEventListener("click", ()=>{
// 	mobile_container.classList.toggle("dragged-height");
// 	resetZmobile()

// })

function resetZmobile(){
	setTimeout(() => {
		mobile_container_after.classList.toggle("z-mobile")
	}, 300);
}

const impulse = new THREE.Vector3(0,1.5,0);
// element.apply.CentralImpulse(impulse);
// reverse gravity
let gforce = -0.5;
let counter =0;

reversegravity = function(){
	if(counter === 0){
		counter++;
		impulse.y = 0;
	// 	setTimeout(() => {
	// 	reversegravity()
	// }, 4500);
	}
	gforce = gforce*-1

	scene.setGravity( new THREE.Vector3( 0, gforce, 0));
	objectstest.forEach(element => {
		element.applyCentralImpulse(impulse);
	});

	// scene.simulate();
}
// comment


// color:0xe42304,
// roughness:0.9,
// metalness:0.05,
// emissive:0x991503,
// emissiveIntensity: 0.15

// TWEENING

// dim lights and set them back
function dimlights(mesh, color){
	let tween = new TWEEN.Tween(mesh).to(color ,1500)
	tween.start();
}


let color;

TEST8 = function(){
	color =  new THREE.Color(0xae1901);
	dimlights(scene.background, color);
	color = new THREE.Color(0xfe2a05);
	dimlights(scene.children[3].material.color, color);
	color = new THREE.Color(0xffffff);
	// dimlights(scene.children[70].children[1].material[0].color, color);
	// dimlights(scene.children[70].children[1].material[1].color, color);
	// color = new THREE.Color(0xe42304)
	color = new THREE.Color(0xff0000)
	let color2 = new THREE.Color(0x991503)

	for (let index = 0; index < objectstest.length; index++) {
		colortween(index, color, color2)

}
 }
 function TEST(){
	color = {r: 0, g: 0, b: 0};
	dimlights(scene.background, color);
	dimlights(scene.children[3].material.color, color);
	// dimlights(scene.children[70].children[1].material[0].color, color);
	// dimlights(scene.children[70].children[1].material[1].color, color);
	for (let index = 0; index < objectstest.length; index++) {
		colortween(index, color)

}
 }



 function colortween(index, color, color2){
			if(!color2){
				color2 = color;
			}
		 let tween = new TWEEN.Tween(objectstest[index].material.emissive).to(color2 ,3500)
		 dimlights(objectstest[index].material.color, color)
		tween.start();
 }




// new mouse

const cursor = document.getElementById("cursor");
const amount = 20;
const sineDots = Math.floor(amount * 0.3);
const width = 50;
const idleTimeout = 150;
let lastFrame = 0;
let mousePosition = {x: 0, y: 0};
let dots = [];
let dotspanss = [];
let timeoutID;
let idle = false;

 const contentwrapper = document.querySelector(".content-wrapper")
 const btnwrapper = document.querySelector(".btn-wraper");
 const info2 = document.querySelector(".inner-info2");
 const lang = document.querySelector(".lang");
 const hebrew = document.querySelector(".hebrew");
 const soon = document.querySelector(".soon");
 const logo = document.querySelector(".logo");
 let fas = document.querySelector(".fas")
 let link = document.querySelector(".link")


 fas.addEventListener("click", ()=>
 {
	if(lang.firstElementChild.innerHTML == "עברית" || lang.firstElementChild.innerHTML == "עב׳"){
		if(fas.firstChild.innerHTML !== "Close"){

			fas.firstChild.innerHTML = "Close";
			toggleZ(uiel);
			setTimeout(() => {
			   info2.classList.add("inner-info-hover", "ease" , "bg-op")
			   contentwrapper.style = "opacity: 1";
			}, );

			togglebled()
		}else{
			setTimeout(() => {
				toggleZ(uiel);
			}, 1000);
			contentwrapper.style = "overflow-x: hidden";
		   info2.classList.remove("inner-info-hover", "bg-op")
			fas.firstChild.innerHTML = "Our <span style=\"font-weight: 400;\"> Clients</span>"
			togglebled()
			// check this timeout function
			// setTimeout(() => {

			// }, 1000);
		}
	}else{
		if(fas.firstChild.innerHTML !== "סגירה"){

			fas.firstChild.innerHTML = "סגירה";
			toggleZ(uiel);
			setTimeout(() => {
			   info2.classList.add("inner-info-hover" , "ease" , "bg-op")
			   contentwrapper.style = "opacity:1";
			}, );
			togglebled()
		}else{


			setTimeout(() => {
				toggleZ(uiel);
			}, 1000);
			contentwrapper.style = "overflow-x: hidden";
		   info2.classList.remove("inner-info-hover" , "bg-op")
		   fas.firstElementChild.innerHTML = "הלקוחות <span style=\"font-weight: 400;\"> שלנו</span>"
		   togglebled()
			setTimeout(() => {
			}, 1000);
		}

	}


})


function togglebled(){
	if(window.innerWidth > 600){
		setTimeout(() => {
			cursor.classList.toggle("blend")
			dotspanss.forEach(element => {
			element.classList.toggle("cursorspan")
		});
		}, 500);
	}

}

let contact = document.querySelector(".contact")
let wrappera = document.querySelector(".wrapper-a")
let uiel = [link,logo,btnwrapper,lang]
function toggleZ(el){
	el.forEach(element => {
		element.classList.toggle("zzero")
	});

}



// make sure to stop click when on the contacts div
wrappera.addEventListener("click" , (e) => e.stopPropagation())


// clip path for contactus div
link.addEventListener("click" , () => {
	if(window.innerWidth > 600){
		redoToBig();
}else{
		mobile_container.style.height = "332px"
		mobile_container_after.style = "opacity:1;"
	}

});

// close.addEventListener("click",  (e) => {
// 	e.stopPropagation();
// 	yosik(contact)})
contact.addEventListener("click", () => redoToBig())


function yosik(el){
	el.classList.toggle("inner-info-hover")
	togglebled()
}

function redoToBig(){
	yosik(contact)
		if(lang.firstElementChild.innerHTML == "עברית" || lang.firstElementChild.innerHTML == "עב׳"){
			if(link.firstElementChild.innerHTML !== "Close"){

				link.firstElementChild.innerHTML = "Close";
				link.style ="z-index:99"
			}else{

				link.firstElementChild.innerHTML = "Contact <span style=\"font-weight: 400;\"> Us</span>"
				link.style =""
			}
	}else{
		if(link.firstElementChild.innerHTML !== "סגירה"){
			link.firstElementChild.innerHTML = "סגירה";
			link.style ="z-index:99"
		}else{
			link.firstElementChild.innerHTML = "יצירת<span style=\"font-weight: 400;\"> קשר</span> "
			link.style =""
		}
	}
}

if(window.innerWidth < 600){
	lang.firstElementChild.style = "font-weight:normal"
	if(lang.firstElementChild.innerHTML == `En<span class="g">g</span>lish`){
		lang.firstElementChild.innerHTML = `En<span class="g">g</span>`
	}else{
	lang.firstElementChild.innerHTML = "עב׳"
}
}
	// clip path for heb/eng switch
lang.addEventListener("click", () => {
	hebrew.classList.toggle("inner-info-hover")
	toggleAll();
	togglebled()
	if(lang.firstElementChild.innerHTML == "עברית" || lang.firstElementChild.innerHTML == `עב׳`){
		setTimeout(() => {
			if(lang.firstElementChild.innerHTML == "עברית" || lang.firstElementChild.innerHTML == `עב׳`){
				if(lang.firstElementChild.innerHTML == "עברית"){
					lang.firstElementChild.innerHTML = `En<span class="g">g</span>lish`
				}else{
					lang.firstElementChild.innerHTML = `En<span class="g">g</span>`
				}

				soon.innerHTML = "עולים</br><span style=\"font-weight: 400;\"> בקרוב</span>"
				soon.dir = "rtl";
				if(!info2.classList.contains("inner-info-hover")){
					fas.firstElementChild.innerHTML = "הלקוחות<span style=\"font-weight: 400;\"> שלנו</span> ";
				}else{
					fas.firstElementChild.innerHTML = "סגירה"

				}
				// close.firstElementChild.innerHTML = "סגירה"
				link.firstElementChild.innerHTML = "יצירת<span style=\"font-weight: 400;\"> קשר</span> "
				contentwrapper.previousElementSibling.innerHTML = "הלקוחות <span style=\"font-weight: 400;\"> שלנו</span>  "
				contentwrapper.previousElementSibling.dir = "rtl";
				mobile_link.firstElementChild.firstElementChild.innerHTML = "יצירת <span style=\"font-weight: 400;\"> קשר</span>  "
				mobile_link.firstElementChild.firstElementChild.dir = "rtl";
			}
			toggleAll();
			hebrew.classList.toggle("inner-info-hover")
			togglebled()
		}, 1600);
	}
	else{
		setTimeout(() => {
			if(lang.firstElementChild.innerHTML == `En<span class="g">g</span>lish`){
				lang.firstElementChild.innerHTML = "עברית"
			}else{
				lang.firstElementChild.innerHTML = `עב׳`
			}
				// lang.firstElementChild.innerHTML = "עברית"
				soon.innerHTML = `Comin<span class="g">g</span></br><span style=\"font-weight: 400;\"> Soon</span>`
				soon.dir = "ltr";
				if(!info2.classList.contains("inner-info-hover")){
					fas.firstElementChild.innerHTML = "Our <span style=\"font-weight: 400;\">Clients</span> ";
				}else{
					fas.firstElementChild.innerHTML = "Close"
				}
				link.firstElementChild.innerHTML = "Contact <span style=\"font-weight: 400;\"> Us</span>"
				// close.firstElementChild.innerHTML = "Close"
				contentwrapper.previousElementSibling.innerHTML = "Our <span style=\"font-weight: 400;\"> Clients</span>"
				contentwrapper.previousElementSibling.dir = "ltr";
				mobile_link.firstElementChild.firstElementChild.innerHTML = " Contact <span style=\"font-weight: 400;\"> Us</span>"
				mobile_link.firstElementChild.firstElementChild.dir = "ltr";
			hebrew.classList.toggle("inner-info-hover")
			toggleAll();
			togglebled()
		}, 1600);
	}


})

function toggleAll(){
	opacityToggle(soon)
	opacityToggle(lang)
	opacityToggle(fas)
	opacityToggle(logo)
	opacityToggle(btnwrapper)
	opacityToggle(link)
	// might need some css for transition opacity
	opacityToggle(contentwrapper.previousElementSibling)
	opacityToggle(mobile_link.firstElementChild.firstElementChild)
}
function opacityToggle(element){
	element.classList.toggle("opacity")
}



window.addEventListener( 'resize', onWindowResize, false );
if(window.innerWidth > 1025){
	document.addEventListener( 'mousemove', onDocumentMouseMove, false );


}else{
	// gyro
	window.addEventListener("deviceorientation", handleOrientation, true);
}
let y,x;
function handleOrientation(event) {
	x = event.beta;  // In degree in the range [-180,180]
	y = event.gamma; // In degree in the range [-90,90]
	// Because we don't want to have the device upside down
	// We constrain the x value to the range [-90,90]
	if (x >  90) { x =  90};
	if (x < -90) { x = -90};
	// To make computation easier we shift the range of
	// x and y to [0,180]
	x += 90;
	y += 90;

	// camera.position.y= 0.8;
	// camera.position.y= 5;

	// camera.lookAt(newcenter);
  }


// handle cursor z-index

// function hoverUi(el){
// 	el.forEach(element => {
// 		element.addEventListener()
// 	});
// }
// cursor.style = "z-index:99";
// cursor.style = "";



class Dot {
    constructor(index = 0) {
        this.index = index;
        this.anglespeed = 0.03;
        this.x = 0;
        this.y = 0;
        this.scale = 2 - 0.1 * index;
        this.range = width / 1.2 - width / 2 * this.scale + 3;
        this.limit = width * 1 * this.scale;
        this.element = document.createElement("span");
        TweenMax.set(this.element, {scale: this.scale});
		cursor.appendChild(this.element);
		dotspanss.push(this.element)
    }

    lock() {
        this.lockX = this.x;
        this.lockY = this.y;
        this.angleX = Math.PI * 2 * Math.random();
        this.angleY = Math.PI * 2 * Math.random();
    }

    draw() {
        if (!idle || this.index <= sineDots) {
            TweenMax.set(this.element, {x: this.x + 11, y: this.y +11});
        } else {
            this.angleX += this.anglespeed;
            this.angleY += this.anglespeed;
            this.y = this.lockY + Math.sin(this.angleY) * this.range;
            this.x = this.lockX + Math.sin(this.angleX) * this.range;
            TweenMax.set(this.element, {x: this.x, y: this.y});
        }
    }
}

function startIdleTimer() {
    timeoutID = setTimeout(goInactive, idleTimeout);
    idle = false;
}

function resetIdleTimer() {
    clearTimeout(timeoutID);
    startIdleTimer();
}


function goInactive() {
    idle = true;
    for (let dot of dots) {
        dot.lock();

    }

}

function buildDots() {
    for (let i = 0; i < amount; i++) {
        let dot = new Dot(i);
        dots.push(dot);
    }


}

// lerp
// const lerp = (x, y, a) => x * (1 - a) + y * a;
// let newlerp
 		function onDocumentMouseMove( event ) {





	// end mouse

				// 	if(info2.classList.contains("ease") && fas.firstElementChild.innerHTML !== "Close" && fas.firstElementChild.innerHTML !== "סגירה"){
				// 		info2.classList.remove("ease")
				// 		circlesize = 8;
				// 	}
				// 	circlesize = 8;
				// bgleft = event.clientX;
				// bgtop  = event.clientY;
				// info2.style.clipPath = `circle(${circlesize}%  at ${bgleft}px ${bgtop}px)`;

				// soon.style = `left: calc(${moveX}px + 50%); top: calc(${moveY}px + 40vh); transform: rotateX(${rotateX}deg), rotateY(${rotateY}deg)`
				mouseX = ( event.clientX - windowHalfX );
				mouseY = ( event.clientY - windowHalfY );
				// start mouse
				mousePosition.x = event.clientX - width / 2;
				mousePosition.y = event.clientY - width / 2;
				resetIdleTimer();
			}
		function onWindowResize() {


			camera.aspect =  container.offsetWidth  / container.offsetHeight;

			if(window.innerWidth < 1240){
				scene.children[70].position.x = 0;
				// console.log(scene.children[70])
			}else{
				scene.children[70].position.x = -2.6;
			}
			// renderer.setSize( container.offsetWidth, container.offsetHeight );
			renderer.setSize( container.offsetWidth, container.offsetHeight );
			composer.setSize( container.offsetWidth, container.offsetHeight );
			const pixelRatio = renderer.getPixelRatio();

			fxaaPass.material.uniforms[ 'resolution' ].value.x = 1 / ( container.offsetWidth * pixelRatio );
			fxaaPass.material.uniforms[ 'resolution' ].value.y = 1 / ( container.offsetHeight * pixelRatio );
			camera.updateProjectionMatrix();
		}

		let mx, my;
		// const positionCursor = delta => {
		const positionCursor = () => {
			mx = mousePosition.x;
			my = mousePosition.y;
			dots.forEach((dot, index, dots) => {
				let nextDot = dots[index + 1] || dots[0];
				dot.x = mx;
				dot.y = my;
				// dot.draw(delta);
				dot.draw();

				if (!idle || index <= sineDots) {
					const dx = (nextDot.x - dot.x) * 0.35;
					const dy = (nextDot.y - dot.y) * 0.35;
					mx += dx;
					my += dy;
				}
			});
		};

		function animate(timestamp) {
			// betterMouse(timestamp);




				TWEEN.update();
				scene.simulate();


				// STATS
				stats.update();
				transitionCamera();
				renderer.clear();
				composer.render();
				positionCursor();
				requestAnimationFrame( animate );
		}
		let delta;
		function betterMouse(timestamp){
				// delta = timestamp - lastFrame;
    			positionCursor(delta);
    			// lastFrame = timestamp;
		}
function transitionCamera(){

				if(window.innerWidth > 1025){
					camera.position.x += ( mouseX*0.0020 - camera.position.x ) * .03;
					camera.position.y += ( -mouseY*0.00025 - camera.position.y +0.9) * .03;
				}else if(x !== undefined){

					camera.position.y  += ((x/180 *1.5) - camera.position.y + 0.9)* .5;
					camera.position.x += ((y/180 *2) - camera.position.x)*0.5;
				}

				camera.lookAt(center);
}
		lastFrame += new Date();
		buildDots()
        init();
		animate();



				// loadingmanager.onLoad = setTimeout(() => {


				// }, 1500);