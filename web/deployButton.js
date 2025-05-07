import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

// Initialize module state at the top level
const DeploySystem = {
    isInitialized: false,
    isDeploying: false
};

function saveObjectAsJSON(obj, filename) {
    const jsonStr = JSON.stringify(obj, null, 2);  // Pretty print with 2 spaces
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.download = filename;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);

    // Return the path to the file
    return filename;
}

function downloadBlob(filename, blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    }, 0);
}

// Create modal overlay and dialog
function createDeployModal() {
    // Check if modal already exists
    if (document.getElementById('deploy-modal-overlay')) {
        return document.getElementById('deploy-modal-overlay');
    }

    // Create modal overlay
    const modalOverlay = document.createElement('div');
    modalOverlay.id = 'deploy-modal-overlay';
    modalOverlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
        display: none;
    `;

    const modalDialog = document.createElement('div');
    modalDialog.id = 'deploy-modal-dialog';
    modalDialog.style.cssText = `
        background-color: #222;
        border-radius: 5px;
        padding: 20px;
        width: 800px; /* Increased width for new fields */
        max-width: 90%;
        box-shadow: 0 0 15px rgba(0, 0, 0, 0.3);
    `;

    const modalContent = document.createElement('div');

    const title = document.createElement('h3');
    title.textContent = 'Deployment Configuration';
    title.style.cssText = `
        margin-top: 0;
        margin-bottom: 15px;
        color: #fff;
    `;

    // Create input field for Product Name
    const productNameLabel = document.createElement('label');
    productNameLabel.textContent = 'Product Name:';
    productNameLabel.style.cssText = `
        display: block;
        margin-bottom: 5px;
        color: #fff;
    `;

    const productNameInput = document.createElement('input');
    productNameInput.type = 'text';
    productNameInput.id = 'deploy-product-name';
    productNameInput.style.cssText = `
        width: 100%;
        padding: 8px;
        margin-bottom: 15px;
        background-color: #333;
        border: 1px solid #444;
        border-radius: 3px;
        color: #fff;
        box-sizing: border-box;
    `;

    const userIdLabel = document.createElement('label');
    userIdLabel.textContent = 'User ID:';
    userIdLabel.style.cssText = `
        display: block;
        margin-bottom: 5px;
        color: #fff;
    `;

    const userIdInput = document.createElement('input');
    userIdInput.type = 'text';
    userIdInput.id = 'deploy-user-id';
    userIdInput.style.cssText = `
        width: 100%;
        padding: 8px;
        margin-bottom: 15px;
        background-color: #333;
        border: 1px solid #444;
        border-radius: 3px;
        color: #fff;
        box-sizing: border-box;
    `;

    // Create input field for Secret Key
    const secretKeyLabel = document.createElement('label');
    secretKeyLabel.textContent = 'Secret Key:';
    secretKeyLabel.style.cssText = `
        display: block;
        margin-bottom: 5px;
        color: #fff;
    `;

    const secretKeyInput = document.createElement('input');
    secretKeyInput.type = 'password';
    secretKeyInput.id = 'deploy-secret-key';
    secretKeyInput.style.cssText = `
        width: 100%;
        padding: 8px;
        margin-bottom: 15px;
        background-color: #333;
        border: 1px solid #444;
        border-radius: 3px;
        color: #fff;
        box-sizing: border-box;
    `;

    // Create section for detected models
    const detectedModelsLabel = document.createElement('label');
    detectedModelsLabel.textContent = 'Detected Models (from workflow):';
    detectedModelsLabel.style.cssText = `
        display: block;
        margin-bottom: 5px;
        color: #fff;
    `;
    const detectedModelsArea = document.createElement('div');
    detectedModelsArea.id = 'deploy-detected-models';
    detectedModelsArea.style.cssText = `
        width: 100%;
        min-height: 50px;
        max-height: 150px;
        overflow-y: auto;
        padding: 8px;
        margin-bottom: 15px;
        background-color: #333;
        border: 1px solid #444;
        border-radius: 3px;
        color: #ccc;
        font-size: 0.9em;
        box-sizing: border-box;
    `;

    // Create input field for additional model paths
    const additionalModelsLabel = document.createElement('label');
    additionalModelsLabel.textContent = 'Add Model File or Folder Path:';
    additionalModelsLabel.style.cssText = `
        display: block;
        margin-bottom: 5px;
        color: #fff;
    `;

    const additionalInputContainer = document.createElement('div');
    additionalInputContainer.style.cssText = `
        display: flex;
        gap: 10px;
        margin-bottom: 15px;
    `;

    const additionalModelsInput = document.createElement('input');
    additionalModelsInput.type = 'text';
    additionalModelsInput.id = 'deploy-additional-models-input';
    additionalModelsInput.placeholder = 'Enter path and click Add';
    additionalModelsInput.style.cssText = `
        flex-grow: 1; /* Takes available space */
        padding: 8px;
        background-color: #333;
        border: 1px solid #444;
        border-radius: 3px;
        color: #fff;
        box-sizing: border-box;
    `;

    const addModelButton = document.createElement('button');
    addModelButton.textContent = 'Add';
    addModelButton.id = 'deploy-add-model-button';
    addModelButton.type = 'button'; // Prevent form submission if wrapped in a form
    addModelButton.style.cssText = `
        padding: 8px 15px;
        background-color: #007bff; /* Blue color for add */
        border: none;
        border-radius: 3px;
        color: #fff;
        cursor: pointer;
    `;

    additionalInputContainer.appendChild(additionalModelsInput);
    additionalInputContainer.appendChild(addModelButton);

    // Create button container
    const buttonContainer = document.createElement('div');
    buttonContainer.style.cssText = `
        display: flex;
        justify-content: flex-end;
        gap: 10px;
    `;

    // Create cancel button
    const cancelButton = document.createElement('button');
    cancelButton.textContent = 'Cancel';
    cancelButton.style.cssText = `
        padding: 8px 15px;
        background-color: #444;
        border: none;
        border-radius: 3px;
        color: #fff;
        cursor: pointer;
    `;
    cancelButton.onclick = () => {
        modalOverlay.style.display = 'none';
    };

    // Create deploy button
    const deployButton = document.createElement('button');
    deployButton.textContent = 'Deploy';
    deployButton.id = 'deploy-submit-button';
    deployButton.style.cssText = `
        padding: 8px 15px;
        background-color: #588157;
        border: none;
        border-radius: 3px;
        color: #fff;
        cursor: pointer;
    `;

    // Create loading spinner element
    const loadingSpinner = document.createElement('div');
    loadingSpinner.id = 'deploy-loading-spinner';
    loadingSpinner.style.cssText = `
        display: none;
        width: 20px;
        height: 20px;
        margin: 10px auto;
        border: 3px solid #f3f3f3;
        border-top: 3px solid #588157;
        border-radius: 50%;
        animation: deploy-spin 1s linear infinite;
    `;

    // Add the spin animation
    const styleElement = document.createElement('style');
    styleElement.textContent = `
        @keyframes deploy-spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    `;
    document.head.appendChild(styleElement);

    // Create status message element
    const statusMessage = document.createElement('div');
    statusMessage.id = 'deploy-status-message';
    statusMessage.style.cssText = `
        margin-top: 10px;
        margin-bottom: 15px;
        padding-top: 8px;
        padding-bottom: 8px;
        text-align: center;
        color: #fff;
        display: none;
    `;

    deployButton.onclick = () => {
        const productName = document.getElementById('deploy-product-name').value;
        const userId = document.getElementById('deploy-user-id').value;
        const secretKey = document.getElementById('deploy-secret-key').value;

        // Collect models from the detectedModelsArea
        const detectedModelsArea = document.getElementById('deploy-detected-models');
        const modelPathDivs = detectedModelsArea.querySelectorAll('div');
        const modelsToDeploy = Array.from(modelPathDivs).map(div => div.textContent.trim()).filter(path => path !== '');

        if (!productName || !userId || !secretKey) {
            alert('Please enter Product Name, User ID and Secret Key');
            return;
        }

        // Show loading spinner and disable button
        deployButton.disabled = true;
        deployButton.style.backgroundColor = '#444';
        loadingSpinner.style.display = 'block';
        statusMessage.style.display = 'block';
        statusMessage.innerHTML = 'Deploying...<br><span style="font-size: 0.9em; opacity: 0.8; margin-top: 5px; display: block;">This will take a while, don\'t close this window. You can check the progress on your Creator Dashboard.</span>';

        // Call a dedicated function to handle deployment with the credentials
        performDeployment(productName, userId, secretKey);
    };

    // Assemble modal
    buttonContainer.appendChild(cancelButton);
    buttonContainer.appendChild(deployButton);

    modalContent.appendChild(title);
    modalContent.appendChild(productNameLabel);
    modalContent.appendChild(productNameInput);
    modalContent.appendChild(userIdLabel);
    modalContent.appendChild(userIdInput);
    modalContent.appendChild(secretKeyLabel);
    modalContent.appendChild(secretKeyInput);
    modalContent.appendChild(detectedModelsLabel);
    modalContent.appendChild(detectedModelsArea);
    modalContent.appendChild(additionalModelsLabel);
    modalContent.appendChild(additionalInputContainer);
    modalContent.appendChild(loadingSpinner);
    modalContent.appendChild(statusMessage);
    modalContent.appendChild(buttonContainer);

    modalDialog.appendChild(modalContent);
    modalOverlay.appendChild(modalDialog);
    document.body.appendChild(modalOverlay);

    return modalOverlay;
}

// Helper function to create a model entry div with a remove button
function createModelEntryDiv(modelPath, areaToUpdate) {
    const entryDiv = document.createElement('div');
    entryDiv.style.cssText = `
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 5px 0;
        border-bottom: 1px solid #444;
    `;

    const pathSpan = document.createElement('span');
    pathSpan.textContent = modelPath;
    pathSpan.style.maxWidth = '90%'; // Prevent long paths from pushing button too far
    pathSpan.style.overflow = 'hidden';
    pathSpan.style.textOverflow = 'ellipsis';
    pathSpan.style.whiteSpace = 'nowrap';

    const removeButton = document.createElement('button');
    removeButton.textContent = '×'; // Using a multiplication sign for 'x'
    removeButton.style.cssText = `
        background-color: transparent;
        color: #aaa;
        border: none;
        cursor: pointer;
        font-size: 1.2em;
        padding: 0 5px;
        line-height: 1;
    `;
    removeButton.onmouseover = () => { removeButton.style.color = '#fff'; };
    removeButton.onmouseout = () => { removeButton.style.color = '#aaa'; };
    removeButton.onclick = () => {
        entryDiv.remove();
        // If no models are left, show a placeholder message
        if (areaToUpdate.childElementCount === 0) {
            areaToUpdate.innerHTML = '<div>No models specified. Add paths below or load from workflow.</div>';
        }
    };

    entryDiv.appendChild(pathSpan);
    entryDiv.appendChild(removeButton);
    return entryDiv;
}

// Show the modal when the button is clicked
async function showDeployModal() {
    const modal = createDeployModal();
    modal.style.display = 'flex';

    // Reset input fields
    document.getElementById('deploy-product-name').value = '';
    document.getElementById('deploy-user-id').value = '';
    document.getElementById('deploy-secret-key').value = '';
    document.getElementById('deploy-additional-models-input').value = '';
    const detectedModelsArea = document.getElementById('deploy-detected-models');
    detectedModelsArea.innerHTML = '<div>Loading detected models...</div>';

    // Focus on the first input
    document.getElementById('deploy-product-name').focus();

    try {
        const graph = await app.graphToPrompt();
        const workflow = graph.output;

        const response = await api.fetchApi("/deploy/get_initial_models", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ workflow: workflow })
        });

        let initialModels;
        if (response instanceof Response) {
            initialModels = await response.json();
        } else {
            initialModels = response;
        }

        if (initialModels && initialModels.models && initialModels.models.length > 0) {
            detectedModelsArea.innerHTML = ''; // Clear loading message
            const existingPaths = new Set(); // To track paths for initial load duplicate check
            initialModels.models.forEach(modelPath => {
                if (!existingPaths.has(modelPath)) {
                    const modelDiv = createModelEntryDiv(modelPath, detectedModelsArea);
                    detectedModelsArea.appendChild(modelDiv);
                    existingPaths.add(modelPath);
                }
            });
            if (detectedModelsArea.childElementCount === 0) { // Should not happen if models.length > 0 but good practice
                detectedModelsArea.innerHTML = '<div>No models automatically detected. Add paths below.</div>';
            }
        } else {
            detectedModelsArea.innerHTML = '<div>No models automatically detected in the workflow. Add paths below.</div>';
        }

    } catch (error) {
        console.error("Error fetching initial models:", error);
        detectedModelsArea.innerHTML = '<div>Error loading detected models. Please check console.</div>';
    }

    // Add event listener for the new "Add Model" button
    const addModelBtn = document.getElementById('deploy-add-model-button');
    const additionalModelInputField = document.getElementById('deploy-additional-models-input'); // Renamed for clarity
    const currentDetectedModelsArea = document.getElementById('deploy-detected-models'); // Use current reference

    addModelBtn.onclick = async () => {
        const pathToAdd = additionalModelInputField.value.trim();
        if (!pathToAdd) {
            alert("Please enter a model or folder path.");
            return;
        }

        try {
            const response = await api.fetchApi("/deploy/validate_and_get_model_paths", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ path: pathToAdd })
            });

            let validationResult;
            if (response instanceof Response) {
                validationResult = await response.json();
            } else {
                validationResult = response;
            }

            if (validationResult && validationResult.status === "success" && validationResult.model_paths) {
                if (validationResult.model_paths.length > 0) {
                    // Clear "loading" or "no models" message if it's the first real addition
                    const firstChild = currentDetectedModelsArea.firstChild;
                    if (firstChild && (firstChild.textContent.includes("Loading detected models...") ||
                        firstChild.textContent.includes("No models automatically detected") ||
                        firstChild.textContent.includes("No models specified"))) {
                        currentDetectedModelsArea.innerHTML = '';
                    }

                    validationResult.model_paths.forEach(modelPath => {
                        // Duplicate check before adding
                        let alreadyExists = false;
                        currentDetectedModelsArea.querySelectorAll('span').forEach(span => {
                            if (span.textContent === modelPath) {
                                alreadyExists = true;
                            }
                        });

                        if (!alreadyExists) {
                            const modelDiv = createModelEntryDiv(modelPath, currentDetectedModelsArea);
                            currentDetectedModelsArea.appendChild(modelDiv);
                        } else {
                            console.log("Path already in list:", modelPath);
                            // Optionally show a small message to user that it's a duplicate
                        }
                    });
                    additionalModelInputField.value = ''; // Clear input field
                } else {
                    alert("No valid model files found at the specified path.");
                }
            } else {
                alert("Error validating path: " + (validationResult.message || "Unknown error"));
            }
        } catch (error) {
            console.error("Error adding model path:", error);
            alert("Failed to add model path. Check console for details.");
        }
    };
}

// Separate deployment logic from any UI/modal handling
async function performDeployment(product_name, user_id, secret_key) {
    // Prevent multiple simultaneous deployments
    if (DeploySystem.isDeploying) {
        console.log("Deployment already in progress");
        return;
    }

    DeploySystem.isDeploying = true;

    // Get UI elements
    const deployButton = document.getElementById('deploy-submit-button');
    const loadingSpinner = document.getElementById('deploy-loading-spinner');
    const statusMessage = document.getElementById('deploy-status-message');

    // Collect models from the detectedModelsArea divs
    const detectedModelsAreaForDeployment = document.getElementById('deploy-detected-models');
    const modelPathDivsForDeployment = detectedModelsAreaForDeployment.querySelectorAll('div > span'); // Select only the spans with paths
    const modelsToDeploy = Array.from(modelPathDivsForDeployment)
        .map(span => span.textContent.trim()) // Get text from span
        .filter(path => path !== '' &&
            !path.includes("Loading detected models...") &&
            !path.includes("No models automatically detected") &&
            !path.includes("Error loading detected models") &&
            !path.includes("No models specified"));

    try {
        // Validate parameters here - don't show UI elements from this function
        if (!product_name || !user_id || !secret_key) {
            console.error("Missing required parameters for deployment");
            return;
        }

        var filename = "graphics_workflow_re.json";
        const graph = await app.graphToPrompt();
        const json = JSON.stringify(graph["output"], null, 2);
        const blob = new Blob([json], { type: "application/json" });
        downloadBlob(filename, blob)


        var filename = "graphics_workflow.json";
        var workflow = graph.output;


        // Fetch object_info and properly extract the JSON data
        const response = await api.fetchApi("/object_info", {
            method: "GET",
            headers: { "Content-Type": "application/json" }
        });

        // Check if response is a Response object that needs to be parsed
        let object_info;
        if (response instanceof Response) {
            try {
                object_info = await response.json();
            } catch (e) {
                console.error("Error parsing response JSON:", e);
                object_info = {}; // Set default value if parsing fails
            }
        } else {
            // If api.fetchApi already returns parsed data
            object_info = response;
        }


        // Create the request body
        const requestData = {
            "workflow": workflow,
            "filePath": filename,
            "object_info": object_info,
            "product_name": product_name,
            "user_id": user_id,
            "secret_key": secret_key,
            "additional_model_paths": modelsToDeploy
        };

        const body = JSON.stringify(requestData);

        console.log("Sending request to API...");
        const requirements_response = await api.fetchApi("/deploy/generate_requirements", {
            method: "POST",
            body,
            headers: { "Content-Type": "application/json" }
        });

        // Fix: properly handle the response object
        let responseData;
        if (requirements_response instanceof Response) {
            try {
                responseData = await requirements_response.json();
            } catch (e) {
                console.error("Error parsing requirements response:", e);
                responseData = {
                    status: "error",
                    message: "Failed to parse server response"
                };
            }
        } else {
            // If api.fetchApi already returns parsed data
            responseData = requirements_response;
        }

        if (responseData.status === "error") {
            // Show error message from the API
            console.error("Deployment error:", responseData.message);
            showDeploymentMessage("error", responseData.message || "An error occurred during deployment");

            // Update the status message in the modal
            if (statusMessage) {
                statusMessage.textContent = responseData.message || "An error occurred during deployment";
                statusMessage.style.color = "#d64545";
            }
        } else {
            // Notify user that deployment was successful
            console.log("Deployment successful:", responseData.message);
            showDeploymentMessage("success", responseData.message || "Deployment initiated successfully!");

            // Update the status message in the modal
            if (statusMessage) {
                statusMessage.textContent = responseData.message || "Deployment initiated successfully!";
                statusMessage.style.color = "#2e7d32";
            }
        }

    } catch (error) {
        console.error("Error in deployment:", error);
        showDeploymentMessage("error", "An error occurred during deployment. Please check the console for details.");

        // Update the status message in the modal
        if (statusMessage) {
            statusMessage.textContent = "An error occurred during deployment. Please check the console for details.";
            statusMessage.style.color = "#d64545";
        }
    } finally {
        DeploySystem.isDeploying = false;

        // Re-enable the button and hide the loading spinner
        if (deployButton) {
            deployButton.disabled = false;
            deployButton.style.backgroundColor = '#588157';
        }

        if (loadingSpinner) {
            loadingSpinner.style.display = 'none';
        }
    }
}

// Function to show deployment messages to the user
function showDeploymentMessage(type, message) {
    // Create notification element if it doesn't exist
    let notificationEl = document.getElementById('deploy-notification');
    if (!notificationEl) {
        notificationEl = document.createElement('div');
        notificationEl.id = 'deploy-notification';
        notificationEl.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 20px;
            border-radius: 5px;
            z-index: 1001;
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
            max-width: 80%;
            transition: opacity 0.3s ease;
        `;
        document.body.appendChild(notificationEl);
    }

    // Set styles based on message type
    if (type === "error") {
        notificationEl.style.backgroundColor = "#d64545";
        notificationEl.style.color = "white";
    } else {
        notificationEl.style.backgroundColor = "#2e7d32";
        notificationEl.style.color = "white";
    }

    // Set message content
    notificationEl.textContent = message;

    // Make notification visible
    notificationEl.style.opacity = "1";

    // Hide notification after 5 seconds
    setTimeout(() => {
        notificationEl.style.opacity = "0";
        setTimeout(() => {
            document.body.removeChild(notificationEl);
        }, 300);
    }, 5000);
}

// Maintain backward compatibility but redirect to the modal
// This prevents accidental direct calls to this function
async function deployButtonAction() {
    console.log("deployButtonAction is deprecated, showing modal instead");
    showDeployModal();
}

// Initialize only once
function initializeDeployExtension() {
    if (DeploySystem.isInitialized) {
        console.log("Deploy extension already initialized");
        return;
    }

    // Make sure we don't register the extension multiple times
    if (!app.extensions || !app.extensions.find(ext => ext.name === "deploy-node.menu.button")) {
        app.registerExtension({
            name: "deploy-node.menu.button",
            async setup() {
                try {
                    let deploy_button = new (await import("../../scripts/ui/components/button.js")).ComfyButton({
                        action: (e) => {
                            // Prevent any default action and stop event propagation
                            if (e && e.preventDefault) e.preventDefault();
                            if (e && e.stopPropagation) e.stopPropagation();

                            // Always show the modal
                            showDeployModal();

                            // Prevent further event handling
                            return false;
                        },
                        tooltip: "deploy-node",
                        content: "Deploy-Node",
                    }).element
                    app.menu?.settingsGroup.element.before(deploy_button);

                    DeploySystem.isInitialized = true;
                }
                catch (exception) {
                    console.log("Exception when loading deploy button: ", exception);
                }
            },
        });
    } else {
        console.log("Extension already registered");
    }
}

// Initialize the extension
initializeDeployExtension();



