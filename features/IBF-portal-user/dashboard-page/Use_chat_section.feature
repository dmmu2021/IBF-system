@ibf-portal-user
Feature: View and use chat section

Background:
    Given a logged-in user on the dashboard page
    Given logged in for a specific "country"

Scenario: View chat section
    When the user enters the dashboard page
    Then the user sees the Chat section on the left of the page
    And it contains a "disaster-type selector" (see details below)
    And it contains a "chat section" (see details below)

Scenario: View Disaster-type selector with 1 "disaster-type"
    Given the "country" has only 1 "disaster-type"
    When the users views the disaster-type selector
    Then the user sees 1 icon representing a disaster-type
    And it is always "selected", meaning colored background with white icon.
    And a text label of the disaster-type is below the icon

Scenario: View Disaster-type selector with multiple "disaster-types"
    Given the "country" has more than 1 "disaster-type"
    When the users views the disaster-type selector
    Then the user sees 2 or more icons representing a disaster-type
    And only one is "selected", meaning colored background with white icon, and text label
    And the others are "unselected", meaning white background with colored icon and no text label
    And the "triggered" disaster-types are purple with white
    And the "non-triggered" disaster-types are navy-blue with white 
    And the "default selected" disaster-type is always the "triggered"
    And if multiple, it is the first from the left
    And if none, then the far-left icon is selected
    And the rest of the dashboard is indeed showing data relating to the "selected" disaster-type

Scenario: Switch Disaster-type
    Given the "country" has more than 1 "disaster-type"
    When the user clicks on a "non-selected" disaster-type
    Then the icon switches to "selected" mode
    And the previous selected icon switches to "unselected" mode
    And the data of the rest the dashboard updates to the new "selected" disaster-type

Scenario: View Chat section
    When the user views the chat-section
    Then there are multiple "speech-bubbles" containing information
    And the speech-bubbles have grey background in NON-TRIGGERED mode
    And the speech-bubbles have purple background in TRIGGERED mode
    And each speech-bubble has a timestamp (of now) in the bottomright corner
    And the 1st speech-bubble gives information on last model run (see below)
    And the 2nd speech-bubble gives general trigger information (see below)
    And if TRIGGERED or OLD-EVENT a 3rd speech-bubble gives further instructions

Scenario: View last model run information
    When the user views the 1st speech bubble
    Then it first says: "Hello <user>"
    And it mentions the date and time of the last model run update. 
    And it has red background if the last model run date is too long ago
    And the threshold for this is if it is more than 1 upload-interval + 10% ago (e.g. 1 day + 10% in case of floods)

Scenario: View general trigger information
    When the user views the 2nd speech bubble
    Then if NON-TRIGGERED it mentions there are 'no triggers'
    And if TRIGGERED it mentions there is a trigger
    And it mentions when the event this trigger belongs to first started
    And it mentions for when the trigger is expected
    And the exact UX copy differs between disaster-types (Potentially: document in more detail)
    And it contains 2 buttons 'About Trigger' and 'Video Guide'

Scenario: Click 'About Trigger' 
    When the user clicks on "About Trigger" button
    Then a new tab opens with the EAP-document
    And if it is a Google Sheet it might scroll automatically to the specific 'trigger' section of the EAP
    And if it is a PDF this is not possible and it loads at the top.

Scenario: Click 'View video'
    When the user clicks on 'Video Guide' button
    Then a popup opens where the video can be played

Scenario: View further instructions
    Given the dashboard is in TRIGGERED state
    When the user views the 3rd speech bubble
    Then it mentions instructions that you can click an area in the map 
    And if done so, that you can perform additional actions per area.
    And it mentions that these are only available on the main admin level.

Scenario: View chat-section after area-selection in map
    When the user selects a triggered area from map (see 'Use_map_section.feature')
    Then a new speech bubble appears in the chat section
    And it is pointed to the right instead of the left
    And it contains the "admin area" type and name 
    And it contains the relevant "action unit" type and value (e.g. "Exposed population" or "Potential cases")
    And it contains a list of all EAP-actions (same for every area) with "area of focus" name and "action" description
    And it shows which EAP-actions are already "checked" via the "checkbox"
    And it contains a disabled "save" button
    And it contains a disabled "close alert" button

Scenario: View EAP-actions per area in OLD-EVENT mode
    Given the dashboard is in OLD-EVENT mode
    When the users views the chat section
    Then the additional actions per area automatically show for ALL triggered areas
    And the 'close alert' button is enabled

Scenario: Check or uncheck EAP-actions per triggered area
    Given the EAP-action speech-bubble is showing for one or more areas
    When the user checks or unchecks an EAP-action
    Then the 'save' button enables 

    When the user makes further changes that amount to the original selection
    Then the 'save' button disables again
    
    When the user clicks the 'save' button
    Then a popup appears that the database is updated
    And it closes again by clicking outside of it
    And (after refreshing) the Area-of-Focus summary will have updated (see 'Use_area_of_focus_section.feature')

Scenario: Close event
    Given the dashboard is in OLD-EVENT mode
    When the user clicks the 'close alert' button
    Then a popup appears that asks if you are sure
    And if confirmed the dashboard updates, and the area is now no longer visible in the list
    And the event is now closed with today's date in the database
    And as such reflected in the "activation report"