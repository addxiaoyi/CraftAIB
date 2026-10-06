import {
    applyProcessing,
    downloadBlockGrid,
    downloadNBT,
    downloadSchematic,
    stopVoxelization,
    updatePalette,
    updateTargetImage,
    voxelConvert,
} from "./script.js";

const DEFAULT_TARGET = "./res/upload.svg";
const $ = (selector) => document.querySelector(selector);
const on = (selector, event, handler) => $(selector)?.addEventListener(event, handler);

on("#convertButton", "click", voxelConvert);
on("#downloadButton", "click", downloadNBT);
on("#downloadSchematicButton", "click", downloadSchematic);
on("#downloadGridButton", "click", downloadBlockGrid);
on("#image-input", "change", imageUpdate);
on("#discretize-checkbox", "change", applyProcessing);
on("#dither-checkbox", "change", updatePalette);
on("#reset-image", "click", resetImage);
on("#reset-image-mini", "click", resetImage);
on("#reset-3d", "click", reset3D);
on("#reset-3d-mini", "click", reset3D);
on("#pixelart-checkbox", "change", updatePixelArtVisibility);

for (const slider of document.querySelectorAll("input[type=range]")) {
    slider.addEventListener("input", handleSliderInput);
}

for (const input of document.querySelectorAll(".number-input")) {
    input.addEventListener("change", handleNumberInput);
}

for (const nav of document.querySelectorAll(".nav-item")) {
    nav.addEventListener("click", () => {
        document.querySelectorAll(".nav-item").forEach((item) => item.classList.remove("is-active"));
        nav.classList.add("is-active");
    });
}

const dropZone = $(".hero-canvas");
if (dropZone) {
    for (const eventName of ["dragenter", "dragover"]) {
        dropZone.addEventListener(eventName, (event) => {
            event.preventDefault();
            dropZone.classList.add("is-dragging");
        });
    }
    for (const eventName of ["dragleave", "drop"]) {
        dropZone.addEventListener(eventName, (event) => {
            event.preventDefault();
            dropZone.classList.remove("is-dragging");
        });
    }
    dropZone.addEventListener("drop", (event) => {
        const file = [...(event.dataTransfer?.files ?? [])].find((item) => item.type.startsWith("image/"));
        if (!file) return;
        const input = $("#image-input");
        const transfer = new DataTransfer();
        transfer.items.add(file);
        input.files = transfer.files;
        imageUpdate();
    });
}

function imageUpdate() {
    stopVoxelization();
    const input = $("#image-input");
    const resolution = clamp(Number($("#resolution-number")?.value) || 512, 128, 2048);
    const source = input?.files?.[0];
    const image = new Image();

    image.onload = () => {
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        const aspect = image.width / image.height;
        canvas.width = aspect >= 1 ? resolution : Math.max(1, Math.round(resolution * aspect));
        canvas.height = aspect >= 1 ? Math.max(1, Math.round(resolution / aspect)) : resolution;
        context.drawImage(image, 0, 0, canvas.width, canvas.height);

        const scaled = new Image();
        scaled.onload = () => {
            updateTargetImage(scaled);
            const size = $("#canvas-size");
            if (size) size.textContent = `${canvas.width} × ${canvas.height} px`;
            const thumb = $(".asset-thumb img");
            if (thumb) thumb.src = canvas.toDataURL("image/png");
            dropZone?.classList.remove("is-empty");
        };
        scaled.src = canvas.toDataURL("image/png");
    };

    image.onerror = () => setWorkspaceMessage("图片读取失败，请换一张 PNG、JPG 或 WebP 图片。", true);
    image.src = source ? URL.createObjectURL(source) : DEFAULT_TARGET;
}

function handleSliderInput(event) {
    const slider = event.currentTarget;
    const number = $(`#${slider.id.replace("-slider", "-number")}`);
    if (number) number.value = slider.classList.contains("logarithmic") ? Math.floor(2 ** Number(slider.value)) : slider.value;

    if (slider.id === "resolution-slider") imageUpdate();
    if (slider.id === "depth-min" || slider.id === "depth-max") syncDepthRange(slider.id);
    applyProcessing();
}

function handleNumberInput(event) {
    const number = event.currentTarget;
    const slider = $(`#${number.id.replace("-number", "-slider")}`);
    if (!slider) return;

    const min = Number(slider.min || 0);
    const max = Number(slider.max || 100);
    const value = clamp(Number(number.value) || min, min, max);
    number.value = value;
    slider.value = slider.classList.contains("logarithmic") ? Math.log2(value) : value;

    if (slider.id === "resolution-slider") imageUpdate();
    if (slider.id === "depth-min" || slider.id === "depth-max") syncDepthRange(slider.id);
    applyProcessing();
}

function syncDepthRange(changedId) {
    const minSlider = $("#depth-min");
    const maxSlider = $("#depth-max");
    if (!minSlider || !maxSlider) return;

    if (changedId === "depth-min") maxSlider.value = Math.max(Number(maxSlider.value), Number(minSlider.value));
    if (changedId === "depth-max") minSlider.value = Math.min(Number(minSlider.value), Number(maxSlider.value));
    $("#depth-min-number").value = minSlider.value;
    $("#depth-max-number").value = maxSlider.value;
}

function updatePixelArtVisibility() {
    const isPixelArt = $("#pixelart-checkbox")?.checked;
    document.querySelectorAll(".pixelart-disabled-settings").forEach((element) => {
        element.style.display = isPixelArt ? "none" : "";
    });
}

function resetImage() {
    resetGroup("#settings-image");
    imageUpdate();
    applyProcessing();
}

function reset3D() {
    resetGroup("#settings-3d");
    updatePixelArtVisibility();
    applyProcessing();
}

function resetGroup(selector) {
    document.querySelectorAll(`${selector} input`).forEach((input) => {
        if (input.type === "checkbox") input.checked = input.defaultChecked;
        else if (input.defaultValue !== undefined) input.value = input.defaultValue;
    });
}

function setWorkspaceMessage(message, isError = false) {
    const hint = $(".canvas-hint");
    if (!hint) return;
    hint.textContent = message;
    hint.classList.toggle("is-error", isError);
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

updatePixelArtVisibility();
syncDepthRange("depth-max");

export { imageUpdate, imageUpdate as image_update };


