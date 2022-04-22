import selectors from "../../support/selectors";
import constants from "../../support/constants";

// Chat component
describe("Chat component", () => {
    beforeEach(() => {
        cy.login();

    });

    it("loads DisasterType", () => {

         cy.get(selectors.disastertypes).should("be.visible")
        .should("not.be.disabled");
    });
    
    it("validate and print DisasterTypeSelected labels", () => {
        cy.get(selectors.disasterlabel).should("be.visible")
        .invoke("text")
        .should("not.be.empty");
        });

    it("load and validate intro messages and followup messages", () => {
            cy.get(selectors.chat).should("be.visible")
            .invoke("text")
            .should("not.be.empty");
      });


  
    it("loads IbfGuide button", () => {
            cy.get(selectors.ibfGuidebutton)
              .should("be.visible")
              .should("not.be.disabled");
    
             
          });
          
    it("click and close video guide button", () => {
          
            cy.get(selectors.ibfGuidebutton).click();
            cy.get(selectors.ibfGuideclosebutton).click();

       
          });

    it("validate About Trigger ", () => {

            cy.get(selectors.AboutTrigger).should("be.visible")
            .should("not.be.disabled")
      });
});
