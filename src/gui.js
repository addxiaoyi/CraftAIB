import { voxelConvert, applyProcessing, updatePalette, downloadNBT, downloadSchematic, downloadBlockGrid, updateTargetImage, stopVoxelization } from "./script.js";

document.getElementById("convertButton").addEventListener("click", voxelConvert, false);
document.getElementById("downloadButton").addEventListener("click", downloadNBT, false);
document.getElementById("downloadSchematicButton").addEventListener("click", downloadSchematic, false);
document.getElementById("downloadGridButton").addEventListener("click", downloadBlockGrid, false);

const DEFAULT_TARGET = './res/upload.svg';
const image_input = document.querySelector('#image-input');
image_input.addEventListener("change", image_update);

function image_update() {
    stopVoxelization();
    const img = document.querySelector("#image-input").files[0];
    const resolution = parseInt(document.querySelector("#resolution-number").value, 10);
    const image = new Image();

    image.onload = function () {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        const aspect = image.width / image.height;
        canvas.width = aspect > 1 ? resolution : Math.max(1, Math.round(resolution * aspect));
        canvas.height = aspect > 1 ? Math.max(1, Math.round(resolution / aspect)) : resolution;
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

        const scaled = new Image();
        scaled.onload = function () {
            updateTargetImage(scaled);
            const size = document.querySelector("#canvas-size");
            if (size) size.textContent = `${canvas.width} × ${canvas.height} px`;
        };
        scaled.src = canvas.toDataURL("image/png");
    };

    image.src = img ? URL.createObjectURL(img) : DEFAULT_TARGET;
}
const sliders = document.querySelectorAll("input[type=range]");
for (const slider of sliders) slider.addEventListener("input", updateSlider);

const numberInputs = document.querySelectorAll(".number-input");
for (const number of numberInputs) {
    number.addEventListener("change", function () {
        const sliderId = number.id.replace("-number", "-slider");
        const slider = document.querySelector(`#${sliderId}`);
        if (!slider) return;
        const min = Number(slider.min || 0);
        const max = Number(slider.max || 100);
        const value = Math.min(max, Math.max(min, Number(number.value) || min));
        number.value = value;
        slider.value = slider.classList.contains("logarithmic") ? Math.log2(value) : value;
        if (slider.id === "resolution-slider") image_update();
        applyProcessing();
    });
}

function updateSlider(event) {
    const slider = event.target;
    const number = document.querySelector(`#${slider.id.replace("-slider", "-number")}`);
    if (number) number.value = slider.classList.contains("logarithmic") ? Math.floor(Math.pow(2, slider.value)) : slider.value;
    if (slider.id === "resolution-slider") image_update();
    applyProcessing();
}
const discretize_checkbox = document.querySelector('#discretize-checkbox');
discretize_checkbox.addEventListener("change", discretize_update);

function discretize_update() {
    applyProcessing();
}

const pixelart_checkbox = document.querySelector('#pixelart-checkbox');
pixelart_checkbox.addEventListener("change", pixelart_update);
function pixelart_update() {
    var pixelart_hide = document.getElementsByClassName('pixelart-disabled-settings');
    const display = pixelart_checkbox.checked ? 'none' : '';
    for (var i = 0; i < pixelart_hide.length; i++) {
        pixelart_hide[i].style.display = display;
    }
}

var depth_min_slider = document.querySelector('#depth-min');
var depth_max_slider = document.querySelector('#depth-max');
var depth_min_number = document.querySelector('#depth-min-number');
var depth_max_number = document.querySelector('#depth-max-number');
var depth_selected = document.getElementById('depth-selected');

depth_min_slider.addEventListener("input", depth_updateMinSlider);
function depth_updateMinSlider() {
    //collision between slider seletors
    depth_max_slider.value = Math.max(depth_max_slider.value, parseInt(depth_min_slider.value));
    //copying the slider values to the numbers
    depth_min_number.value = depth_min_slider.value;
    depth_max_number.value = depth_max_slider.value;
    updateAllSlidersBackgrounds();
}
depth_max_slider.addEventListener("input", depth_updateMaxSlider);
function depth_updateMaxSlider() {
    //collision between slider seletors
    depth_min_slider.value = Math.min(depth_min_slider.value, parseInt(depth_max_slider.value));
    //copying the slider values to the numbers
    depth_min_number.value = depth_min_slider.value;
    depth_max_number.value = depth_max_slider.value;
    updateAllSlidersBackgrounds();
}
depth_min_number.addEventListener("change", depth_updateMinNumber);
function depth_updateMinNumber() {
    //change the user text to a number
    depth_min_number.value = parseInt(depth_min_number.value) || depth_min_number.min;
    depth_min_number.value = Math.min(depth_min_number.max, Math.max(depth_min_number.min, depth_min_number.value));
    //collision between number seletors
    depth_max_number.value = Math.max(depth_max_number.value, parseInt(depth_min_number.value));
    //copying the number values to the slider
    depth_min_slider.value = depth_min_number.value;
    depth_max_slider.value = depth_max_number.value;
    updateAllSlidersBackgrounds();
}
depth_max_number.addEventListener("change", depth_updateMaxNumber);
function depth_updateMaxNumber() {
    //change the user text to a number
    depth_max_number.value = parseInt(depth_max_number.value) || depth_max_number.max;
    depth_max_number.value = Math.min(depth_max_number.max, Math.max(depth_max_number.min, depth_max_number.value));
    //collision between number seletors
    depth_min_number.value = Math.min(depth_min_number.value, parseInt(depth_max_number.value));
    //copying the number values to the slider
    depth_min_slider.value = depth_min_number.value;
    depth_max_slider.value = depth_max_number.value;
    updateAllSlidersBackgrounds();
}

depth_updateMaxSlider();
depth_updateMinSlider();

document.querySelector('#dither-checkbox').addEventListener("change", updatePalette);

document.querySelector('#reset-image').addEventListener("click", resetImage);
document.querySelector('#reset-image-mini')?.addEventListener("click", resetImage);
document.querySelector('#reset-3d').addEventListener("click", reset3D);
document.querySelector('#reset-3d-mini')?.addEventListener("click", reset3D);

function resetImage() {
    
    const numbers = document.querySelectorAll('#settings-image input[type="number"]');
    numbers.forEach(number => {
        number.value = number.defaultValue;
    });

    const sliders = document.querySelectorAll('#settings-image input[type="range"]');
    sliders.forEach(slider => {
        slider.value = slider.defaultValue;
        updateSliderBackground({ target: slider });
    });

    const checkboxes = document.querySelectorAll('#settings-image input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
        checkbox.checked = checkbox.defaultChecked;
    });


    applyProcessing();
    updateAllSlidersBackgrounds();
}

function reset3D() {
    const numbers = document.querySelectorAll('#settings-3d input[type="number"]');
    numbers.forEach(number => {
        number.value = number.defaultValue;
    });

    const sliders = document.querySelectorAll('#settings-3d input[type="range"]');
    sliders.forEach(slider => {
        slider.value = slider.defaultValue;
        updateSliderBackground({ target: slider });
    });

    const checkboxes = document.querySelectorAll('#settings-3d input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
        checkbox.checked = checkbox.defaultChecked;
    });

    pixelart_update();
    applyProcessing();
}

export { image_update };


