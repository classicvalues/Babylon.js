
module BABYLON {

    export enum PoseEnabledControllerType {
        VIVE,
        OCULUS,
        GENERIC
    }

    export interface MutableGamepadButton {
        value: number;
        touched: boolean;
        pressed: boolean;
    }

    export class PoseEnabledControllerHelper {
        public static InitiateController(vrGamepad: any) {
            // for now, only Oculus and Vive are supported
            if (vrGamepad.id.indexOf('Oculus Touch') !== -1) {
                return new OculusTouchController(vrGamepad);
            } else {
                return new ViveController(vrGamepad);
            }
        }
    }

    export class PoseEnabledController extends Gamepad implements PoseControlled {
        devicePosition: Vector3;
        deviceRotationQuaternion: Quaternion;
        deviceScaleFactor: number = 1;

        public position: Vector3;
        public rotationQuaternion: Quaternion;
        public controllerType: PoseEnabledControllerType;

        private _calculatedPosition: Vector3;
        private _calculatedRotation: Quaternion;

        public rawPose: DevicePose; //GamepadPose;

        private _mesh: AbstractMesh; // a node that will be attached to this Gamepad
        private _poseControlledCamera: PoseControlled;

        constructor(public vrGamepad) {
            super(vrGamepad.id, vrGamepad.index, vrGamepad);
            this.type = Gamepad.POSE_ENABLED;
            this.controllerType = PoseEnabledControllerType.GENERIC;
            this.position = Vector3.Zero();
            this.rotationQuaternion = new Quaternion();
            this.devicePosition = Vector3.Zero();
            this.deviceRotationQuaternion = new Quaternion();

            this._calculatedPosition = Vector3.Zero();
            this._calculatedRotation = new Quaternion();
        }

        public update() {
            super.update();
            // update this device's offset position from the attached camera, if provided
            if (this._poseControlledCamera && this._poseControlledCamera.deviceScaleFactor) {
                //this.position.copyFrom(this._poseControlledCamera.position);
                //this.rotationQuaternion.copyFrom(this._poseControlledCamera.rotationQuaternion);
                this.deviceScaleFactor = this._poseControlledCamera.deviceScaleFactor;
            }
            var pose: GamepadPose = this.vrGamepad.pose;
            this.updateFromDevice(pose);

            if (this._mesh) {
                this._mesh.position.copyFrom(this._calculatedPosition);
                this._mesh.rotationQuaternion.copyFrom(this._calculatedRotation);
            }
        }

        updateFromDevice(poseData: DevicePose) {
            if (poseData) {
                this.rawPose = poseData;
                if (poseData.position) {
                    this.devicePosition.copyFromFloats(poseData.position[0], poseData.position[1], -poseData.position[2]);
                    if (this._mesh && this._mesh.getScene().useRightHandedSystem) {
                        this.devicePosition.z *= -1;
                    }

                    this.devicePosition.scaleToRef(this.deviceScaleFactor, this._calculatedPosition);
                    this._calculatedPosition.addInPlace(this.position);

                    // scale the position using the scale factor, add the device's position
                    if (this._poseControlledCamera) {
                        // this allows total positioning freedom - the device, the camera and the mesh can be individually controlled.
                        this._calculatedPosition.addInPlace(this._poseControlledCamera.position);
                    }
                }
                if (poseData.orientation) {
                    this.deviceRotationQuaternion.copyFromFloats(this.rawPose.orientation[0], this.rawPose.orientation[1], -this.rawPose.orientation[2], -this.rawPose.orientation[3]);
                    if (this._mesh && this._mesh.getScene().useRightHandedSystem) {
                        this.deviceRotationQuaternion.z *= -1;
                        this.deviceRotationQuaternion.w *= -1;
                    }

                    // if the camera is set, rotate to the camera's rotation
                    this.rotationQuaternion.multiplyToRef(this.deviceRotationQuaternion, this._calculatedRotation);
                    if (this._poseControlledCamera) {
                        this._calculatedRotation.multiplyToRef(this._poseControlledCamera.rotationQuaternion, this._calculatedRotation);
                    }
                }
            }
        }


        public attachToMesh(mesh: AbstractMesh) {
            this._mesh = mesh;
            if (!this._mesh.rotationQuaternion) {
                this._mesh.rotationQuaternion = new Quaternion();
            }
        }

        public attachToPoseControlledCamera(camera: PoseControlled) {
            this._poseControlledCamera = camera;
            this.deviceScaleFactor = camera.deviceScaleFactor;
        }

        public detachMesh() {
            this._mesh = undefined;
        }
    }

    export interface GamepadButtonChanges {
        changed: boolean;
        pressChanged: boolean;
        touchChanged: boolean;
        valueChanged: boolean;
    }

    export abstract class WebVRController extends PoseEnabledController {

        //public onTriggerStateChangedObservable = new Observable<{ state: ExtendedGamepadButton, changes: GamepadButtonChanges }>();

        public onTriggerStateChangedObservable = new Observable<ExtendedGamepadButton>();


        public onMainButtonStateChangedObservable = new Observable<ExtendedGamepadButton>();

        public onSecondaryButtonStateChangedObservable = new Observable<ExtendedGamepadButton>();

        public onPadStateChangedObservable = new Observable<ExtendedGamepadButton>();
        public onPadValuesChangedObservable = new Observable<StickValues>();

        protected _buttons: Array<MutableGamepadButton>;

        private _onButtonStateChange: (controlledIndex: number, buttonIndex: number, state: ExtendedGamepadButton) => void;

        public onButtonStateChange(callback: (controlledIndex: number, buttonIndex: number, state: ExtendedGamepadButton) => void) {
            this._onButtonStateChange = callback;
        }

        public pad: StickValues = { x: 0, y: 0 };

        public hand: string; // 'left' or 'right', see https://w3c.github.io/gamepad/extensions.html#gamepadhand-enum

        constructor(vrGamepad) {
            super(vrGamepad);
            this._buttons = new Array<ExtendedGamepadButton>(vrGamepad.buttons.length);
            this.hand = vrGamepad.hand;
        }

        public update() {
            super.update();
            for (var index = 0; index < this._buttons.length; index++) {
                this._setButtonValue(this.vrGamepad.buttons[index], this._buttons[index], index);
            };
            if (this.leftStick.x !== this.pad.x || this.leftStick.y !== this.pad.y) {
                this.pad.x = this.leftStick.x;
                this.pad.y = this.leftStick.y;
                this.onPadValuesChangedObservable.notifyObservers(this.pad);
            }
        }

        protected abstract handleButtonChange(buttonIdx: number, value: ExtendedGamepadButton, changes: GamepadButtonChanges);

        private _setButtonValue(newState: ExtendedGamepadButton, currentState: ExtendedGamepadButton, buttonIndex: number) {
            if (!currentState) {
                this._buttons[buttonIndex] = {
                    pressed: newState.pressed,
                    touched: newState.touched,
                    value: newState.value
                }
                return;
            }
            this._checkChanges(newState, currentState);
            if (this._changes.changed) {
                this._onButtonStateChange && this._onButtonStateChange(this.index, buttonIndex, newState);

                this.handleButtonChange(buttonIndex, newState, this._changes);
            }
            this._buttons[buttonIndex].pressed = newState.pressed;
            this._buttons[buttonIndex].touched = newState.touched;
            // oculus triggers are never 0, thou not touched.
            this._buttons[buttonIndex].value = newState.value < 0.00000001 ? 0 : newState.value;
        }

        // avoid GC, store state in a tmp object
        private _changes: GamepadButtonChanges = {
            pressChanged: false,
            touchChanged: false,
            valueChanged: false,
            changed: false
        };

        private _checkChanges(newState: ExtendedGamepadButton, currentState: ExtendedGamepadButton) {
            this._changes.pressChanged = newState.pressed !== currentState.pressed;
            this._changes.touchChanged = newState.touched !== currentState.touched;
            this._changes.valueChanged = newState.value !== currentState.value;
            this._changes.changed = this._changes.pressChanged || this._changes.touchChanged || this._changes.valueChanged;
            return this._changes;
        }
    }

    export class OculusTouchController extends WebVRController {

        public onSecondaryTriggerStateChangedObservable = new Observable<ExtendedGamepadButton>();

        public onThumbRestChangedObservable = new Observable<ExtendedGamepadButton>();

        constructor(vrGamepad) {
            super(vrGamepad);
            this.controllerType = PoseEnabledControllerType.OCULUS;
        }

        // helper getters for left and right hand.
        public get onAButtonStateChangedObservable() {
            if (this.hand === 'right') {
                return this.onMainButtonStateChangedObservable;
            } else {
                throw new Error('No A button on left hand');
            }
        }

        public get onBButtonStateChangedObservable() {
            if (this.hand === 'right') {
                return this.onSecondaryButtonStateChangedObservable;
            } else {
                throw new Error('No B button on left hand');
            }
        }

        public get onXButtonStateChangedObservable() {
            if (this.hand === 'left') {
                return this.onMainButtonStateChangedObservable;
            } else {
                throw new Error('No X button on right hand');
            }
        }

        public get onYButtonStateChangedObservable() {
            if (this.hand === 'left') {
                return this.onSecondaryButtonStateChangedObservable;
            } else {
                throw new Error('No Y button on right hand');
            }
        }

        /*
         0) thumb stick (touch, press, value = pressed (0,1)). value is in this.leftStick
         1) index trigger (touch (?), press (only when value > 0.1), value 0 to 1)
         2) secondary trigger (same)
         3) A (right) X (left), touch, pressed = value
         4) B / Y 
         5) thumb rest
        */
        protected handleButtonChange(buttonIdx: number, state: ExtendedGamepadButton, changes: GamepadButtonChanges) {
            let notifyObject = state; //{ state: state, changes: changes };
            switch (buttonIdx) {
                case 0:
                    this.onPadStateChangedObservable.notifyObservers(notifyObject);
                    return;
                case 1: // index trigger
                    this.onTriggerStateChangedObservable.notifyObservers(notifyObject);
                    return;
                case 2:  // secondary trigger
                    this.onSecondaryTriggerStateChangedObservable.notifyObservers(notifyObject);
                    return;
                case 3:
                    this.onMainButtonStateChangedObservable.notifyObservers(notifyObject);
                    return;
                case 4:
                    this.onSecondaryButtonStateChangedObservable.notifyObservers(notifyObject);
                    return;
                case 5:
                    this.onThumbRestChangedObservable.notifyObservers(notifyObject);
                    return;
            }
        }

    }

    export class ViveController extends WebVRController {


        constructor(vrGamepad) {
            super(vrGamepad);
            this.controllerType = PoseEnabledControllerType.VIVE;
        }

        public get onLeftButtonStateChangedObservable() {
            return this.onMainButtonStateChangedObservable;
        }

        public get onRightButtonStateChangedObservable() {
            return this.onMainButtonStateChangedObservable;
        }

        public get onMenuButtonStateChangedObservable() {
            return this.onSecondaryButtonStateChangedObservable;
        }

        /**
         * Vive mapping:
         * 0: touchpad
         * 1: trigger
         * 2: left AND right buttons
         * 3: menu button
         */
        protected handleButtonChange(buttonIdx: number, state: ExtendedGamepadButton, changes: GamepadButtonChanges) {
            let notifyObject = state; //{ state: state, changes: changes };
            switch (buttonIdx) {
                case 0:
                    this.onPadStateChangedObservable.notifyObservers(notifyObject);
                    return;
                case 1: // index trigger
                    this.onTriggerStateChangedObservable.notifyObservers(notifyObject);
                    return;
                case 2:  // left AND right button
                    this.onMainButtonStateChangedObservable.notifyObservers(notifyObject);
                    return;
                case 3:
                    this.onSecondaryButtonStateChangedObservable.notifyObservers(notifyObject);
                    return;
            }
        }
    }


}

interface ExtendedGamepadButton extends GamepadButton {
    readonly pressed: boolean;
    readonly touched: boolean;
    readonly value: number;
}