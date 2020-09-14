const Alexa = require('ask-sdk-core');
const persistenceAdapter = require('ask-sdk-s3-persistence-adapter');
const moment = require('moment');
const PERMISSIONS = ['alexa::alerts:reminders:skill:readwrite'];

const LaunchRequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest';
    },
    handle(handlerInput) {
        const speechText = 'Hello! Welcome to way of taking medication. What medication do you want to remember to take and at what time?';
        const repromptText = 'Please remind me to take hypotensor at 8am.';
        return handlerInput.responseBuilder
            .speak(speechText)
            .reprompt(speechText)
            .getResponse();
    }
};
const HasMedicationReminderLaunchRequestHandler = {
    canHandle(handlerInput) {

        const attributesManager = handlerInput.attributesManager;
        const sessionAttributes = attributesManager.getSessionAttributes() || {};

        const medication = sessionAttributes.hasOwnProperty('medication') ? sessionAttributes.medication : 0;
        const trigger_event = sessionAttributes.hasOwnProperty('trigger_event') ? sessionAttributes.trigger_event : 0;
        const trigger_event_time = sessionAttributes.hasOwnProperty('trigger_event_time') ? sessionAttributes.trigger_event_time : 0;
        const reminderId = sessionAttributes.hasOwnProperty('reminderId') ? sessionAttributes.reminderId : 0;
        const inquiry_reminderId = sessionAttributes.hasOwnProperty('inquiry_reminderId') ? sessionAttributes.inquiry_reminderId : 0;

        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest'
            && medication
            && trigger_event
            && trigger_event_time
            && reminderId
            && inquiry_reminderId
    },
    async handle(handlerInput) {
        const attributesManager = handlerInput.attributesManager;
        const sessionAttributes = attributesManager.getSessionAttributes() || {};

        const medication = sessionAttributes.hasOwnProperty('medication') ? sessionAttributes.medication : 0;
        const trigger_event = sessionAttributes.hasOwnProperty('trigger_event') ? sessionAttributes.trigger_event : 0;
        const trigger_event_time = sessionAttributes.hasOwnProperty('trigger_event_time') ? sessionAttributes.trigger_event_time : 0;

        const speechText = `Welcome back. Did you take ${medication} after ${trigger_event}? Please answer this question with Not Yet or I did. You also can delete the reminder here. And if you want to leave just say stop.`;
        return handlerInput.responseBuilder
            .speak(speechText)
            .reprompt(speechText)
            .getResponse();
    }
};
const CaptureEventBasedReminderIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'EventBasedReminderIntent';
    },
    async handle(handlerInput) {
        const medication = handlerInput.requestEnvelope.request.intent.slots.medication.value
        const trigger_event = handlerInput.requestEnvelope.request.intent.slots.trigger_event.value
        const trigger_event_time = handlerInput.requestEnvelope.request.intent.slots.trigger_event_time.value
        
        const attributesManager = handlerInput.attributesManager;
        const sessionAttributes = attributesManager.getSessionAttributes() || {};
        const reminderId = sessionAttributes.hasOwnProperty('reminderId') ? sessionAttributes.reminderId : 0;
        const inquiry_reminderId = sessionAttributes.hasOwnProperty('inquiry_reminderId') ? sessionAttributes.inquiry_reminderId : 0;
        
        if(reminderId!==0 || inquiry_reminderId){
            const speakOutput = 'You can set only one reminder. Because multiple reminders can interact with each other and prevent you from forming a habit as soon as possible. So You should delete the reminder here.';
            const repromptText = 'I want to delete the previous reminder.';
            return handlerInput.responseBuilder
                .speak(speakOutput)
                .reprompt(speakOutput)
                .getResponse();
        }
        
        const medication_reminderAttributes = {
            "medication" : medication,
            "trigger_event" : trigger_event,
            "trigger_event_time" : trigger_event_time
        };
        attributesManager.setPersistentAttributes(medication_reminderAttributes);
        await attributesManager.savePersistentAttributes();
        
        const speakOutput = `So would you like a reminder at ${trigger_event_time} to take ${medication} after ${trigger_event}?`;
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
}
const CreateEventBasedReminderIntentHandler = {
    canHandle(handlerInput) {
        return handlerInput.requestEnvelope.request.type === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.YesIntent';
    },
    async handle(handlerInput) {
        const consentToken = handlerInput.requestEnvelope.context.System.apiAccessToken;
        
        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes() || {};
    
        const medication = sessionAttributes.medication;
        const trigger_event = sessionAttributes.trigger_event;
        const trigger_event_time = sessionAttributes.trigger_event_time;
        const reminderId = sessionAttributes.hasOwnProperty('reminderId') ? sessionAttributes.reminderId : 0;
        const inquiry_reminderId = sessionAttributes.hasOwnProperty('inquiry_reminderId') ? sessionAttributes.inquiry_reminderId : 0;
        
        let trigger_event_hour, trigger_event_minute;
        [trigger_event_hour, trigger_event_minute] = trigger_event_time.split(":");
        console.log(`trigger event hour: ${trigger_event_hour}`);
        console.log(`trigger event minute: ${trigger_event_minute}`);
        
        const inquiryTime = moment({ hours: trigger_event_hour, minutes: trigger_event_minute}).add(1, 'hours');
        const inquiryTimeFormat = inquiryTime.format('HH:mm'); 
    
        if(reminderId!==0 || inquiry_reminderId!==0){
            const speakOutput = "You can set only one reminder. Because multiple reminders can interact with each other and prevent you from forming a habit as soon as possible. So You should delete the reminder here. And you don't need say anything if you want to keep it";
            const repromptText = 'I want to delete the previous reminder.';
            return handlerInput.responseBuilder
                .speak(speakOutput)
                .reprompt(speakOutput)
                .getResponse();
        }
        
        if (!consentToken) {
            const speechText = `Sorry, this skill requires access to reminders. Check out Alexa app activity.`;
            return handlerInput.responseBuilder
                .speak(speechText)
                .withAskForPermissionsConsentCard(PERMISSIONS)
                .getResponse();
        }
        
        const { permissions } = handlerInput.requestEnvelope.context.System.user;
        
        if (!permissions) {
            return handlerInput.responseBuilder
                .addDirective({
                    type: "Connections.SendRequest",
                    name: "AskFor",
                    payload: {
                        "@type": "AskForPermissionsConsentRequest",
                        "@version": "1",
                        "permissionScope": "alexa::alerts:reminders:skill:readwrite"
                    },
                    token: ""
                })
                .getResponse();
        }
        
        try {
            const reminderApiClient = handlerInput.serviceClientFactory.getReminderManagementServiceClient();
            
            const remindTime = moment({ hours: trigger_event_hour, minutes: trigger_event_minute});
            const timeFormat = 'YYYY-MM-DDTHH:mm:ss.SSS';
            
            const reminderRequest = {
                requestTime: moment().format(timeFormat),
                trigger: {
                    type: 'SCHEDULED_ABSOLUTE',
                    scheduledTime: remindTime.format(timeFormat),
                    timeZoneId: 'Europe/London', 
                    recurrence: { freq: 'DAILY' },
                },
                alertInfo: {
                    spokenInfo: {
                        content: [{
                            locale: "en-UK",   
                            text: "Remember to take "+medication+" after "+trigger_event
                        }]
                    }
                },
                pushNotification: {
                    status: 'ENABLED',
                }
            };
            
            const reminderApiClient1 = handlerInput.serviceClientFactory.getReminderManagementServiceClient();
            
            const remindTime1 = moment({ hours: trigger_event_hour, minutes: trigger_event_minute}).add(1, 'hours'); 
            const timeFormat1 = 'YYYY-MM-DDTHH:mm:ss.SSS';
            
            const reminderRequest1 = {
                requestTime: moment().format(timeFormat1),
                trigger: {
                    type: 'SCHEDULED_ABSOLUTE',
                    scheduledTime: remindTime1.format(timeFormat1),
                    timeZoneId: 'Europe/London', 
                    recurrence: { freq: 'DAILY' },
                },
                alertInfo: {
                    spokenInfo: {
                        content: [{
                            locale: "en-UK",   
                            text: "Did you take "+medication+" after "+trigger_event+ "?"
                        }]
                    }
                },
                pushNotification: {
                    status: 'ENABLED',
                }
            };
                
            /* Try to create a reminder based on the specified parameters in the request object. */
            const reminderResponse = await reminderApiClient.createReminder(reminderRequest);
            const reminderResponse1 = await reminderApiClient1.createReminder(reminderRequest1);
            
            const attributesManager = handlerInput.attributesManager;
            const medication_reminderAttributes = {
                "medication" : medication,
                "trigger_event" : trigger_event,
                "trigger_event_time" : trigger_event_time,
                "reminderId" : reminderResponse.alertToken,
                "inquiry_reminderId" : reminderResponse1.alertToken
            };
            attributesManager.setPersistentAttributes(medication_reminderAttributes);
            await attributesManager.savePersistentAttributes();
        } catch(error) {
            /* If there is an error trying to create a reminder catch it so the skill can gracefully notify the user that an error occured. */
            console.log(`~~~ Error: ${error}`)
            return handlerInput.responseBuilder
                .speak(`There was an error scheduling your reminder. Please try again later. `)
                .getResponse();
        }

        const speakOutput = `OK, reminder set for ${trigger_event_time} to remind you to take ${medication} after ${trigger_event}. I will check if you have remembered at ${inquiryTimeFormat}.`;
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .withShouldEndSession(true)
            .getResponse();
    }
};
const NotCreateEventBasedReminderIntentHandler = {
    canHandle(handlerInput) {
        return handlerInput.requestEnvelope.request.type === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.NoIntent';
    },
    async handle(handlerInput) {
        return handlerInput.responseBuilder
            .speak('All right, no problem. When you want me to set a reminder for you just holler.')
            .withShouldEndSession(true)
            .getResponse();
    }
}
const IDidIntentHandler = {
    canHandle(handlerInput) {
        return handlerInput.requestEnvelope.request.type === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'IDidIntent';
    },
    async handle(handlerInput) {
        const attributesManager = handlerInput.attributesManager;
        const sessionAttributes = attributesManager.getSessionAttributes() || {};
    
        const medication = sessionAttributes.medication;
        const trigger_event = sessionAttributes.trigger_event;
        
        const speakOutput = `Good job! You are building a habit, taking ${medication}, linked to your trigger event, ${trigger_event}.`;
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .withShouldEndSession(true)
            .getResponse();
    }
}
const NotYetIntentHandler = {
    canHandle(handlerInput) {
        return handlerInput.requestEnvelope.request.type === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'NotYetIntent';
    },
    async handle(handlerInput) {
        const consentToken = handlerInput.requestEnvelope.context.System.apiAccessToken;
        const attributesManager = handlerInput.attributesManager;
        const sessionAttributes = attributesManager.getSessionAttributes() || {};
        const medication = sessionAttributes.medication;
        const trigger_event = sessionAttributes.trigger_event;
        const trigger_event_time = sessionAttributes.trigger_event_time;
        const reminderServiceClient = handlerInput.serviceClientFactory.getReminderManagementServiceClient();
        const previousReminder = sessionAttributes['reminderId'];
        const previousInquiryReminder = sessionAttributes['inquiry_reminderId'];
        
        if (!consentToken) {
            const speechText = `Sorry, this skill requires access to reminders. Check out Alexa app activity.`;
            return handlerInput.responseBuilder
                .speak(speechText)
                .withAskForPermissionsConsentCard(PERMISSIONS)
                .getResponse();
        }
        
        const { permissions } = handlerInput.requestEnvelope.context.System.user;
        
        if (!permissions) {
            return handlerInput.responseBuilder
                .addDirective({
                    type: "Connections.SendRequest",
                    name: "AskFor",
                    payload: {
                        "@type": "AskForPermissionsConsentRequest",
                        "@version": "1",
                        "permissionScope": "alexa::alerts:reminders:skill:readwrite"
                    },
                    token: ""
                })
                .getResponse();
        }
        
        switch (handlerInput.requestEnvelope.request.intent.confirmationStatus) {
        
            case 'CONFIRMED':
                console.log('CONFIRMED!');
                break;
                
            case 'DENIED':
                console.log('DENINED!');
                return handlerInput.responseBuilder
                    .speak(`OK, let’s try to take ${medication} at ${trigger_event_time} after ${trigger_event} again tomorrow`)
                    .withShouldEndSession(true)
                    .getResponse();
                
                case 'NONE':
                default:
                    console.log('NONE....');
                    return handlerInput.responseBuilder
                        .addDelegateDirective()
                        .getResponse();
            }

        try{
            await reminderServiceClient.deleteReminder(previousReminder);
            await reminderServiceClient.deleteReminder(previousInquiryReminder);

            delete sessionAttributes['reminderId'];
            delete sessionAttributes['inquiry_reminderId'];
            const medication_reminderAttributes = {
                "medication" : null,
                "trigger_event" : null,
                "trigger_event_time" : null,
                "reminderId" : null,
                "inquiry_reminderId" : null
            };
            attributesManager.setPersistentAttributes(medication_reminderAttributes);
            await attributesManager.savePersistentAttributes();
        } catch(error) {
            console.log(`~~~ Error: ${error}`)
            return handlerInput.responseBuilder
                .speak('There was an error deleting your reminder. Please try again later.')
                .withShouldEndSession(true)
                .getResponse();
        }
        
        const speakOutput = "Oh Dear! You need set a new medication reminder that is easier to remember! And don't worry, I have deleted the previous reminder. So you can set a new one directly.";
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
}
const DeletePreviousReminderIntentHandler = {
    canHandle(handlerInput) {
        return handlerInput.requestEnvelope.request.type === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'DeleteReminderIntent';
    },
    async handle(handlerInput) {
        const consentToken = handlerInput.requestEnvelope.context.System.apiAccessToken;
        const attributesManager = handlerInput.attributesManager;
        const sessionAttributes = attributesManager.getSessionAttributes() || {};
        const medication = sessionAttributes.medication;
        const trigger_event = sessionAttributes.trigger_event;
        const trigger_event_time = sessionAttributes.trigger_event_time;
        
        let trigger_event_hour, trigger_event_minute;
        [trigger_event_hour, trigger_event_minute] = trigger_event_time.split(":");
        const inquiryTime = moment({ hours: trigger_event_hour, minutes: trigger_event_minute}).add(1, 'hours');
        const inquiryTimeFormat = inquiryTime.format('HH:mm'); 
        
        const reminderServiceClient = handlerInput.serviceClientFactory.getReminderManagementServiceClient();
        const previousReminder = sessionAttributes['reminderId'];
        const previousInquiryReminder = sessionAttributes['inquiry_reminderId'];
        
        const { permissions } = handlerInput.requestEnvelope.context.System.user;
        
        if (!permissions) {
            return handlerInput.responseBuilder
                .addDirective({
                    type: "Connections.SendRequest",
                    name: "AskFor",
                    payload: {
                        "@type": "AskForPermissionsConsentRequest",
                        "@version": "1",
                        "permissionScope": "alexa::alerts:reminders:skill:readwrite"
                    },
                    token: ""
                })
                .getResponse();
        }
        
        if(previousReminder && previousInquiryReminder){
            switch (handlerInput.requestEnvelope.request.intent.confirmationStatus) {
        
                case 'CONFIRMED':
                    console.log('CONFIRMED!');
                    break;
                
                case 'DENIED':
                    console.log('DENINED!');
                    return handlerInput.responseBuilder
                        .speak(`OK, reminders are still set for ${trigger_event_time} to remind you to take ${medication} after ${trigger_event}. I will check if you have remembered at ${inquiryTimeFormat} after ${trigger_event}`)
                        .withShouldEndSession(true)
                        .getResponse();
                
                case 'NONE':
                default:
                    console.log('NONE....');
                    return handlerInput.responseBuilder
                        .addDelegateDirective()
                        .getResponse();
            }

            if (!consentToken) {
                const speechText = `Sorry, this skill requires access to reminders. Check out Alexa app activity.`;
                return handlerInput.responseBuilder
                    .speak(speechText)
                    .withAskForPermissionsConsentCard(PERMISSIONS)
                    .getResponse();
            }

            try{
                await reminderServiceClient.deleteReminder(previousReminder);
                await reminderServiceClient.deleteReminder(previousInquiryReminder);

                delete sessionAttributes['reminderId'];
                delete sessionAttributes['inquiry_reminderId'];
                const medication_reminderAttributes = {
                    "medication" : null,
                    "trigger_event" : null,
                    "trigger_event_time" : null,
                    "reminderId" : null,
                    "inquiry_reminderId" : null
                };
                attributesManager.setPersistentAttributes(medication_reminderAttributes);
                await attributesManager.savePersistentAttributes();
            } catch(error) {
                console.log(`~~~ Error: ${error}`)
                return handlerInput.responseBuilder
                    .speak('There was an error deleting your reminder. Please try again later.')
                    .withShouldEndSession(true)
                    .getResponse();
            }
        
            const speakOutput = 'Ok. All reminders are deleted. So you can set your new medication reminder right now. What medication do you want to remember to take and at what time?';
            return handlerInput.responseBuilder
                .speak(speakOutput)
                .reprompt(speakOutput)
                .getResponse();
        }
        else{
            return handlerInput.responseBuilder
                .speak('You cannot delete your reminder before you create it.')
                .withShouldEndSession(true)
                .getResponse();
        }
    }
}
const HelpIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.HelpIntent';
    },
    handle(handlerInput) {
        const speakOutput = "To use this skill say open way of taking medication. Then you can set only one your specific medication reminder which include medication name, trigger event and trigger event time!";
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};
const CancelAndStopIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && (Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.CancelIntent'
                || Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.StopIntent');
    },
    handle(handlerInput) {
        const speakOutput = 'Thanks for trying out Medication Reminder. Goodbye!';
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .getResponse();
    }
};
const SessionEndedRequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'SessionEndedRequest';
    },
    handle(handlerInput) {
        // Any cleanup logic goes here.
        return handlerInput.responseBuilder.getResponse();
    }
};

// The intent reflector is used for interaction model testing and debugging.
// It will simply repeat the intent the user said. You can create custom handlers
// for your intents by defining them above, then also adding them to the request
// handler chain below.
const IntentReflectorHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest';
    },
    handle(handlerInput) {
        const intentName = Alexa.getIntentName(handlerInput.requestEnvelope);
        const speakOutput = `You just triggered ${intentName}`;

        return handlerInput.responseBuilder
            .speak(speakOutput)
            //.reprompt('add a reprompt if you want to keep the session open for the user to respond')
            .getResponse();
    }
};

// Generic error handling to capture any syntax or routing errors. If you receive an error
// stating the request handler chain is not found, you have not implemented a handler for
// the intent being invoked or included it in the skill builder below.
const ErrorHandler = {
    canHandle() {
        return true;
    },
    handle(handlerInput, error) {
        console.log(`~~~~ Error handled: ${error.stack}`);
        const speakOutput = `Sorry, I had trouble doing what you asked. Please try again.`;

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};
const LoadMedicationReminderInterceptor = {
    async process(handlerInput) {
        const attributesManager = handlerInput.attributesManager;
        const sessionAttributes = await attributesManager.getPersistentAttributes() || {};
        
        const medication = sessionAttributes.hasOwnProperty('medication') ? sessionAttributes.medication : 0;
        const trigger_event = sessionAttributes.hasOwnProperty('trigger_event') ? sessionAttributes.trigger_event : 0;
        const trigger_event_time = sessionAttributes.hasOwnProperty('trigger_event_time') ? sessionAttributes.trigger_event_time : 0;
        
        if (medication && trigger_event && trigger_event_time) {
            attributesManager.setSessionAttributes(sessionAttributes);
        }
    }
};
// The SkillBuilder acts as the entry point for your skill, routing all request and response
// payloads to the handlers above. Make sure any new handlers or interceptors you've
// defined are included below. The order matters - they're processed top to bottom.
exports.handler = Alexa.SkillBuilders.custom()
    .withPersistenceAdapter(
        new persistenceAdapter.S3PersistenceAdapter({bucketName:process.env.S3_PERSISTENCE_BUCKET})
    )
    .addRequestHandlers(
        HasMedicationReminderLaunchRequestHandler,
        LaunchRequestHandler,
        CaptureEventBasedReminderIntentHandler,
        NotCreateEventBasedReminderIntentHandler,
        CreateEventBasedReminderIntentHandler,
        IDidIntentHandler,
        NotYetIntentHandler,
        DeletePreviousReminderIntentHandler,
        HelpIntentHandler,
        CancelAndStopIntentHandler,
        SessionEndedRequestHandler,
        IntentReflectorHandler) // make sure IntentReflectorHandler is last so it doesn't override your custom intent handlers
    .addRequestInterceptors(LoadMedicationReminderInterceptor)
    .addErrorHandlers(ErrorHandler)
    .withApiClient(new Alexa.DefaultApiClient())
    .lambda();
