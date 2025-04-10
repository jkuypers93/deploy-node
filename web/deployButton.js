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
        width: 400px;
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
    modalContent.appendChild(loadingSpinner);
    modalContent.appendChild(statusMessage);
    modalContent.appendChild(buttonContainer);

    modalDialog.appendChild(modalContent);
    modalOverlay.appendChild(modalDialog);
    document.body.appendChild(modalOverlay);

    return modalOverlay;
}

// Show the modal when the button is clicked
function showDeployModal() {
    const modal = createDeployModal();
    modal.style.display = 'flex';

    // Reset input fields
    document.getElementById('deploy-product-name').value = '';
    document.getElementById('deploy-user-id').value = '';
    document.getElementById('deploy-secret-key').value = '';

    // Focus on the first input
    document.getElementById('deploy-product-name').focus();
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
            "secret_key": secret_key
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



