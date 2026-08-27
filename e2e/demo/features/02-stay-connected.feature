Feature: Stay-connected hub for non-applicants

  # Two scenarios cover the /stay-connected cluster end-to-end without
  # requiring authentication (the apply-flow bounce path needs a signed-
  # in user; adding auth helpers is a separate slice of work):
  #
  #   - "Cold visit" — homepage hero CTA into /stay-connected, pick an
  #     interest tag, leave an email. This is the path most visitors
  #     take and the load-bearing demo for the new mechanic.
  #
  #   - "Closed-cycle landing" — direct visit with the same query params
  #     the apply-flow fallback would set, then share the program with
  #     a friend via the refer-a-friend card.

  Scenario: Cold visitor joins the notify-me list from the home hero
    Given I am on the home page
    When I follow the home page Stay connected link
    Then the stay-connected page should be visible
    When I choose the StepUp Scholars next-cycle interest
    And I fill in my notify-me email "future@example.com"
    And I submit the notify-me form
    Then the notify-me success message should be visible

  Scenario: Closed-cycle visitor sees the hub and copies the share link
    Given I land on stay-connected as a closed-cycle StepUp visitor
    Then the hero should reflect a closed-cycle arrival from StepUp Scholars
    When I copy the refer-a-friend share link
    Then the copied share link should remain available
