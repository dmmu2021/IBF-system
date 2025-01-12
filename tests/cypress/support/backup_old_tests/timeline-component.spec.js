import selectors from '../../support/selectors';

Cypress.Commands.add('executeTimelineTests', () => {
  // should load at least 1 active (enabled) timeline button
  cy.get(selectors.timeline.timelineButton).should('not.be.disabled');

  // should load a triggered button if and only if the dashboard is in triggered state
  cy.isStatusTriggered().then((triggered) => {
    triggered
      ? cy.get(`${selectors.timeline.timelineButton}.alert`).should('exist')
      : cy
          .get(`${selectors.timeline.timelineButton}.alert`)
          .should('not.exist');
  });

  // should have only 1 selected button
  cy.get(`${selectors.timeline.timelineButton}.active`).should(
    'have.length',
    1,
  );
});

describe('timeline component', () => {
  beforeEach(() => {
    cy.login();
  });

  // Tests for 1st disaster-type
  it('Disaster type 1: validate timeline buttons', () => {
    // click 1st disaster-type not necessary as it is loaded by default
    // wait for all requests to finish
    cy.waitForRequests();

    cy.executeTimelineTests();
  });

  // Tests for 2nd disaster-type
  it('Disaster type 2: validate timeline buttons', () => {
    //check if there are 2 disasters
    cy.get(selectors.disasterType.disasterTypeButtons).then((buttons) => {
      if (buttons.length > 1) {
        // click 2nd disaster-type
        cy.get(selectors.disasterType.disasterTypeButtons).eq(1).click();
        // wait for all requests to finish
        cy.waitForRequests();

        cy.executeTimelineTests();
      }
    });
  });

  // Tests for 3nd disaster-type
  it('Disaster type 3: validate timeline buttons', () => {
    //check if there are 2 disasters
    cy.get(selectors.disasterType.disasterTypeButtons).then((buttons) => {
      if (buttons.length > 2) {
        // click 2nd disaster-type
        cy.get(selectors.disasterType.disasterTypeButtons).eq(2).click();
        // wait for all requests to finish
        cy.waitForRequests();

        cy.executeTimelineTests();
      }
    });
  });
});
